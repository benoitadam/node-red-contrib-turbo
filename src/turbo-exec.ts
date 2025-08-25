import { NodeAPI, Node, NodeDef } from 'node-red';
import { spawn, ChildProcess, SpawnOptionsWithoutStdio, ChildProcessWithoutNullStreams } from 'child_process';
import { getPath, setTemplate } from './common';


export interface TurboExecNodeDef extends NodeDef {
    name: string;
    script: string;
    streaming: boolean;
    strip: boolean;
    format: 'string' | 'buffer' | 'json' | 'split' | 'full';
    stdin: string;
    timeout: number;
    limit: number;
    cwd: string;
    env: boolean;
}

interface ExecEvent {
    topic: 'start' | 'out' | 'err' | 'exit';
    payload: string | string[] | Buffer | any;
    exec: {
        pid: string;
        cp: ChildProcess & { toJSON: () => null };
        out: (string | Buffer)[];
        err: (string | Buffer)[];
        code: number;
        start: number;
        time: number;
        end: number;
        success: boolean;
        error: string;
    };
}

const isString = (v: any): v is string => typeof v === 'string';
const isStringNotEmpty = (v: any): v is string => isString(v) && v.trim().length > 0
const isNumber = (v: any): v is number => typeof v === 'number' && !Number.isNaN(v);
const isBoolean = (v: any): v is boolean => v === true || v === false;

function toInputChunk(v: any, encoding: BufferEncoding = 'utf8'): Buffer | null {
  if (v === undefined || v === null) return null;
  if (Buffer.isBuffer(v)) return v;
  if (typeof v === 'object') {
    try { return Buffer.from(JSON.stringify(v), encoding); }
    catch { return Buffer.from(String(v), encoding); }
  }
  return Buffer.from(String(v), encoding);
}

function writeToStdinSafe(cp: ChildProcessWithoutNullStreams, chunk: Buffer, node: Node) {
  if (!cp.stdin || cp.stdin.destroyed || !cp.stdin.writable) {
    node.debug('stdin not writable; skipping write');
    return;
  }
  try {
    cp.stdin.write(chunk, (err) => {
      if (!err) return;
      if ((err as NodeJS.ErrnoException).code === 'EPIPE') node.warn('Child process closed stdin (EPIPE). Input ignored.');
      else node.error(`stdin write error: ${err.message}`);
    });
  } catch (err: any) {
    if (err?.code === 'EPIPE') node.warn('Child process closed stdin (EPIPE). Input ignored.');
    else node.error(`stdin write exception: ${err?.message || err}`);
  }
}

interface ExecData {
    outChunks: Buffer[],
    errChunks: Buffer[],
    outBuffer?: Buffer<ArrayBuffer>,
    errBuffer?: Buffer<ArrayBuffer>,
    out?: any,
    err?: any,
    start: number,
    end?: number,
    time: number,
    cp: ChildProcessWithoutNullStreams,
    length: number,
    pid?: number,
    code?: number,
    signal?: string|null,
    success?: boolean,
    error?: string,
    script?: string,
}

module.exports = (RED: NodeAPI) => {
    const TurboExecNode = function(this: Node, def: TurboExecNodeDef) {
        RED.nodes.createNode(this, def);

        const processes = new Set<ChildProcess>();
        
        this.on('close', () => {
            processes.forEach(process => {
                try {
                    process.kill('SIGTERM');
                } catch (_) {}
            });
            processes.clear();
        });


        this.on('input', async (msg: any) => {
            try {
                let script: string = def.script || msg.script || '';
                const streaming: boolean = def.streaming || msg.streaming || false;
                const strip: boolean = def.strip || msg.strip || true;
                const format: string = def.format || msg.format || 'string';
                const stdin: string = def.stdin || msg.stdin || '';
                const timeout: number = Number(def.timeout || msg.timeout || 30);
                const limit: number = Number(def.limit || msg.limit || 10);
                const cwd: string = def.cwd || msg.cwd || process.cwd();
                const env: boolean = def.env || msg.env || true;

                const params = { script, streaming, strip, format, stdin, timeout, limit, cwd, env };
                this.log(`turbo-exec executing with params: ${JSON.stringify(params)}`);

                const propError = (prop: string) => new Error(`Property "${prop}" is required value: ${JSON.stringify((params as any)[prop])}`);

                if (!isStringNotEmpty(script)) throw propError('script');
                if (!isBoolean(streaming)) throw propError('streaming');
                if (!isBoolean(strip)) throw propError('strip');
                if (!isStringNotEmpty(format)) throw propError('format');
                if (!isString(stdin)) throw propError('stdin');
                if (!isNumber(timeout) || timeout < 0) throw propError('timeout');
                if (!isNumber(limit) || limit < 0) throw propError('limit');
                if (!isStringNotEmpty(cwd)) throw propError('cwd');
                if (!isBoolean(env)) throw propError('env');

                const limitBytes = limit > 0 ? limit * 1024 * 1024 : 0;
                const encoding = 'utf8';

                const templateData = { node: this, env: process.env, script, ...msg };
                
                // Apply template directly and execute shell script
                script = setTemplate(script, templateData);
                this.log(`Executing shell script directly (${script.length} chars)`);
                
                const mainCmd = '/bin/sh';
                const cmdArgs = ['-c', script];
                
                const spawnOptions: SpawnOptionsWithoutStdio = {
                    cwd,
                    env: env ? { ...process.env } : {},
                    stdio: ['pipe', 'pipe', 'pipe']
                };
                
                this.log(`Spawning: ${mainCmd} with args: ${JSON.stringify(cmdArgs)}`);
                const cp = spawn(mainCmd, cmdArgs, spawnOptions);

                cp.stdin?.on('error', (err: NodeJS.ErrnoException) => {
                    if (err.code === 'EPIPE') {
                        this.warn('stdin error EPIPE (child not reading/closed).');
                    } else {
                        this.error(`stdin stream error: ${err.message}`);
                    }
                });

                (cp as any).toJSON = () => null;

                const start = Date.now();
                const exec: ExecData = {
                    outChunks: [],
                    errChunks: [],
                    start,
                    time: 0,
                    length: 0,
                    pid: cp.pid,
                    script,
                    cp,
                };
                msg.exec = exec;
                
                processes.add(cp);
                this.log(`Process started with PID: ${cp.pid}`);
                
                if (streaming) {
                    const startEvent = {
                        ...msg,
                        topic: 'start',
                        exec,
                    };
                    this.send([startEvent, null, null, null]);
                }
                
                let timeoutRef: NodeJS.Timeout | null = null;
                if (timeout > 0) {
                    timeoutRef = setTimeout(() => {
                        this.warn(`Process timeout after ${timeout}s, killing PID: ${cp.pid}`);
                        exec.error = `timeout`;
                        try {
                            cp.kill('SIGTERM');
                        } catch (killErr) {
                            this.error(`Failed to kill process: ${killErr}`);
                        }
                    }, timeout * 1000);
                }

                if (stdin && stdin.trim() !== "") {
                    try {
                        const inputVal = getPath(msg, stdin);
                        const chunk = toInputChunk(inputVal, 'utf8');
                        this.log(`Writing to stdin: ${Buffer.isBuffer(inputVal) ? 'buffer' : typeof inputVal}`);
                        if (chunk) {
                        writeToStdinSafe(cp, chunk, this);
                        try { cp.stdin?.end(); } catch { /* ignore */ }
                        } else {
                        this.debug('No stdin provided or empty; skipping write.');
                        }
                    } catch (stdinErr) {
                        this.error(`Error writing to stdin: ${stdinErr}`);
                    }
                }

                const onBufferLimit = () => {
                    this.warn(`Buffer limit exceeded (${limitBytes} bytes), killing process`);
                    exec.error = `buffer limit exceeded (${limitBytes} bytes)`;
                    try {
                        cp.kill('SIGTERM');
                    } catch (killErr) {
                        this.error(`Failed to kill process on buffer limit: ${killErr}`);
                    }
                }

                const baseFormatText = (
                    format === 'json' ? (text: string) => {
                        try {
                            return JSON.parse(text);
                        } catch (e) {
                            return text;
                        }
                    } :
                    format === 'split' ? (text: string) => (
                        text.split('\n').map(l => l.trim()).filter(l => l !== '')
                    ) :
                    format === 'full' ? (text: string) => text :
                    format === 'string' ? (text: string) => text :
                    null
                );

                const formatText = strip && baseFormatText ? (text: string) => baseFormatText(text.replace(/\x1b\[[0-9;]*m/g, '')) : baseFormatText;

                cp.stdout?.on('data', (data: Buffer | string) => {
                    try {
                        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, encoding);
                        exec.outChunks.push(buffer);
                        exec.time = Date.now() - exec.start;
                        exec.length += buffer.length;
                        
                        if (limitBytes > 0 && exec.length > limitBytes) {
                            onBufferLimit();
                            return;
                        }
                        
                        this.log(`STDOUT (${buffer.length} bytes, total: ${exec.length})`);
                        
                        if (streaming) {
                            const payload = formatText !== null ?
                                formatText(buffer.toString(encoding)) :
                                buffer;
                            const outEvent = { ...msg, topic: 'out', payload, exec };
                            this.send([null, outEvent, null, null]);
                        }
                    } catch (error) {
                        this.error(`Error in stdout handler: ${error}`);
                    }
                });
                
                cp.stderr?.on('data', (data: Buffer | string) => {
                    try {
                        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, encoding);
                        exec.errChunks.push(buffer);
                        exec.time = Date.now() - exec.start;
                        exec.length += buffer.length;
                        
                        if (limitBytes > 0 && exec.length > limitBytes) {
                            onBufferLimit();
                            return;
                        }
                        
                        this.log(`STDERR (${buffer.length} bytes, total: ${exec.length})`);
                        
                        if (streaming) {
                            const payload = formatText !== null ?
                                formatText(buffer.toString(encoding)) :
                                buffer;
                            const errEvent = { ...msg, topic: 'err', payload, exec };
                            this.send([null, null, errEvent, null]);
                        }
                    } catch (error) {
                        this.error(`Error in stderr handler: ${error}`);
                    }
                });
                
                cp.on('close', (code: number | null, signal: string | null) => {
                    try {
                        if (timeoutRef) clearTimeout(timeoutRef);
                        processes.delete(cp);
                        
                        exec.end = Date.now();
                        exec.time = exec.end - exec.start;
                        exec.code = code || 0;
                        exec.signal = signal;
                        exec.success = code === 0 && !exec.error;
                        
                        this.log(`Process closed with code: ${code}, signal: ${signal}, success: ${exec.success}`);
                        
                        const outBuffer = Buffer.concat(exec.outChunks)
                        const out = formatText !== null ?
                            formatText(outBuffer.toString(encoding)) :
                            outBuffer;

                        const errBuffer = Buffer.concat(exec.errChunks)
                        const err = formatText !== null ?
                            formatText(errBuffer.toString(encoding)) :
                            errBuffer;

                        exec.outBuffer = outBuffer;
                        exec.out = out;
                        exec.errBuffer = errBuffer;
                        exec.err = err;

                        const payload =
                            format === 'full' ? exec :
                            exec.success ? out :
                            err;

                        const exitEvent = {
                            ...msg,
                            topic: 'exit',
                            payload,
                            exec
                        };
                        
                        if (streaming) {
                            this.send([null, null, null, exitEvent]);
                        } else {
                            this.send(exitEvent);
                        }
                        
                        this.log(`Execution completed`);
                    } catch (error) {
                        this.error(`Error in close handler: ${error}`);
                    }
                });
                
                cp.on('error', (error: Error) => {
                    try {
                        if (timeoutRef) clearTimeout(timeoutRef);
                        processes.delete(cp);
                        
                        exec.error = error.message;
                        exec.success = false;
                        exec.end = Date.now();
                        exec.time = exec.end - exec.start;
                        
                        this.error(`Spawn error: ${error.message}`);
                        
                        const errorEvent = {
                            ...msg,
                            topic: 'exit',
                            payload: error.message,
                            exec
                        };

                        if (streaming) {
                            this.send([null, null, null, errorEvent]);
                        } else {
                            this.send(errorEvent);
                        }
                        
                        this.log(`Error occurred`);
                    } catch (error) {
                        this.error(`Error in error handler: ${error}`);
                    }
                });
            }
            catch(error) {
                this.error(`Error in error turbo-exec: ${error}`);
            }
        });
    }
    
    RED.nodes.registerType("turbo-exec", TurboExecNode);
};