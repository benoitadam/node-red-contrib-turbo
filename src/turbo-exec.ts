import { NodeAPI, Node, NodeDef } from 'node-red';
import { spawn, ChildProcess, SpawnOptionsWithoutStdio, ChildProcessWithoutNullStreams } from 'child_process';
import { getPath, setTemplate } from './common';
import { writeFile } from 'fs/promises';

export interface TurboExecNodeDef extends NodeDef {
    name: string;
    language: 'sh' | 'ts' | 'js' | 'py' | 'go' | 'custom';
    script: string;
    streaming: boolean;
    strip: boolean;
    format: 'string' | 'buffer' | 'json' | 'split';
    stdin: string;
    timeout: number;
    limit: number;
    build: string;
    cmd: string;
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

const isObject = <T extends {} = any>(v: unknown): v is T => typeof v === "object" && v !== null;
const isString = (v: any): v is string => typeof v === 'string' && v.trim().length > 0;
const isNumber = (v: any): v is number => typeof v === 'number' && !Number.isNaN(v);
const isBoolean = (v: any): v is boolean => v === true || v === false;

interface ExecData {
    out: Buffer[],
    err: Buffer[],
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
                // const scriptTemplate = def.script || '';
                // const streaming = def.streaming || false;
                // const timeoutSeconds = def.timeout || 30;
                // const timeoutMs = timeoutSeconds > 0 ? timeoutSeconds * 1000 : 0;
                // const limitMB = def.limit || 10;
                // const limitBytes = limitMB > 0 ? limitMB * 1024 * 1024 : 0;

                let script: string = def.script || msg.script || '';
                const language: string = def.language || msg.language || 'sh';
                const streaming: boolean = def.streaming || msg.streaming || false;
                const strip: boolean = def.strip || msg.strip || true;
                const format: string = def.format || msg.format || 'string';
                const stdin: string = def.stdin || msg.stdin || 'payload';
                const timeout: number = def.timeout || msg.timeout || 30;
                const limit: number = def.limit || msg.limit || 10;
                const build: string = def.build || msg.build || '';
                const cmd: string = def.cmd || msg.cmd || '';
                const cwd: string = def.cwd || msg.cwd || process.cwd();
                const env: boolean = def.env || msg.env || true;

                const params = { language, script, streaming, strip, format, stdin, timeout, limit, build, cmd, cwd, env };
                this.log(`turbo-exec executing with params: ${JSON.stringify(params)}`);

                const propError = (prop: string) => new Error(`Property "${prop}" is required value: ${JSON.stringify((params as any)[prop])}`);

                if (!isString(language)) throw propError('language');
                if (!isString(script)) throw propError('script');
                if (!isBoolean(streaming)) throw propError('streaming');
                if (!isBoolean(strip)) throw propError('strip');
                if (!isString(format)) throw propError('format');
                if (!isString(stdin) && stdin !== '') throw propError('stdin');
                if (!isNumber(timeout) || timeout < 0) throw propError('timeout');
                if (!isNumber(limit) || limit < 0) throw propError('limit');
                if (!isString(build)) throw propError('build');
                if (!isString(cmd)) throw propError('cmd');
                if (!isString(cwd)) throw propError('cwd');
                if (!isBoolean(env)) throw propError('env');

                const limitBytes = limit > 0 ? limit * 1024 * 1024 : 0;
                const encoding = 'utf8';

                script = setTemplate(script, msg);
                
                this.log(`script: ${script}`);
                
                // const buildCmd = setTemplate(build, { ...msg, scriptFile, buildFile });
                // const runCmd = setTemplate(cmd, { ...msg, script });
                
                // this.log(`Build command: ${runCmd}`);
                // this.log(`Run command: ${runCmd}`);
                
                // Parse command and arguments safely
                // const cmdParts = runCmd.trim().split(/\s+/);
                // if (cmdParts.length === 0) {
                //     throw new Error('Empty command');
                // }
                
                // const mainCmd = cmdParts[0];
                // const cmdArgs = cmdParts.slice(1);
                
                const spawnOptions: SpawnOptionsWithoutStdio = {
                    cwd,
                    env: env ? { ...process.env } : {},
                    stdio: ['pipe', 'pipe', 'pipe']
                };
                
                // this.log(`Spawning: ${mainCmd} with args: ${JSON.stringify(cmdArgs)}`);
                const cp = spawn('/bin/sh', ['-c', script], spawnOptions);

                (cp as any).toJSON = () => null;

                const start = Date.now();
                const exec: ExecData = {
                    out: [],
                    err: [],
                    start,
                    time: 0,
                    length: 0,
                    pid: cp.pid,
                    cp,
                };
                msg.exec = exec;
                
                processes.add(cp);
                this.log(`Process started with PID: ${cp.pid}`);
                
                if (streaming) {
                    const startEvent = {
                        ...msg,
                        topic: 'start',
                        payload: exec,
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

                if (stdin && stdin.trim() !== '') {
                    try {
                        let stdinData = getPath(msg, stdin);
                        this.log(`Writing to stdin: ${typeof stdinData === 'string' ? stdinData.substring(0, 100) : typeof stdinData}`);
                        
                        if (cp.stdin && cp.stdin.writable) {
                            if (Buffer.isBuffer(stdinData)) {
                                cp.stdin.write(stdinData);
                            } else {
                                try {
                                    stdinData = JSON.stringify(stdinData);
                                } catch (jsonErr) {
                                    this.warn(`Failed to stringify stdin (${stdin}) data: ${jsonErr}`);
                                    stdinData = String(stdinData);
                                }
                                cp.stdin.write(stdinData);
                            }
                            cp.stdin.end();
                        } else {
                            this.warn('Process stdin is not writable');
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
                    format === 'string' ? (text: string) => text :
                    null
                );

                const formatText = strip && baseFormatText ? (text: string) => baseFormatText(text.replace(/\x1b\[[0-9;]*m/g, '')) : baseFormatText;

                cp.stdout?.on('data', (data: Buffer | string) => {
                    try {
                        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, encoding);
                        exec.out.push(buffer);
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
                        exec.err.push(buffer);
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
                        
                        const buffer = Buffer.concat(exec.out)
                        const payload = formatText !== null ?
                            formatText(buffer.toString(encoding)) :
                            buffer;
                        
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