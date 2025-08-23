import { NodeAPI, Node, NodeDef } from 'node-red';
import { spawn, ChildProcess, SpawnOptionsWithoutStdio, ChildProcessWithoutNullStreams } from 'child_process';
import { getPath, setTemplate } from './common';
import { writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';

interface CacheMetadata {
    updated?: number;
    runCmd?: string;
    mainCmd?: string;
    cmdArgs?: string[];
}

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
    updated: number;
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

        const buildScript = async (scriptFile: string, buildFile: string, buildCmd: string, script: string, cwd: string): Promise<void> => {
            this.log(`Running build command: ${buildCmd}`);

            const buildProcess = spawn('/bin/sh', ['-c', buildCmd], {
                cwd,
                env: process.env,
                stdio: ['pipe', 'pipe', 'pipe'] as const
            });

            await new Promise<void>((resolve, reject) => {
                let stderr = '';
                
                buildProcess.stderr?.on('data', (data) => {
                    stderr += data.toString();
                });
                
                buildProcess.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`Build failed with exit code ${code}: ${stderr}`));
                    }
                });
                
                buildProcess.on('error', (error) => {
                    reject(new Error(`Build spawn error: ${error.message}`));
                });
            });

            this.log(`Build completed successfully`);
        };

        this.on('input', async (msg: any) => {
            try {
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
                const updated: number = def.updated || 0;

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

                this.log(`Script updated : ${updated}`);
                
                let mainCmd: string;
                let cmdArgs: string[];

                const templateData = { node: this, env: process.env, script, ...msg };
                
                // For shell scripts, apply template directly and execute without caching
                if (language === 'sh') {
                    script = setTemplate(script, templateData);
                    this.log(`Executing shell script directly (${script.length} chars)`);
                    
                    mainCmd = '/bin/sh';
                    cmdArgs = ['-c', script];
                } else {
                    // For compiled languages, use cache system
                    const buildExt = language === 'go' ? '' : '.js';
                    
                    const id = this.id;
                    const cacheFile = `${cwd}/.red_turbo_${id}.json`;
                    
                    this.log(`Using cacheFile: ${cacheFile}`);
                    
                    let cache: CacheMetadata = {};
                    try {
                        if (existsSync(cacheFile)) {
                            const cacheContent = await readFile(cacheFile, 'utf8');
                            const cacheData = JSON.parse(cacheContent) as CacheMetadata;
                            if (!isObject(cacheData)) throw '...' // TODO
                            cache = cacheData;
                            this.log(`Cache found - updated: ${cache.updated}`);
                        }
                    } catch (err) {
                        this.warn(`Failed to read cache file: ${err}`);
                    }
                    
                    // Check if we need to rebuild  
                    const scriptFile = `${cwd}/.red_turbo_${id}.${language}`;
                    const buildFile = `${cwd}/.red_turbo_${id}${buildExt}`;
                    const needsRebuild = !cache || cache.updated !== updated || !existsSync(buildFile);
                                       
                    if (needsRebuild) {
                        this.log(`Rebuilding`);
                        templateData.scriptFile = scriptFile;
                        templateData.buildFile = buildFile;

                        this.log(`Rebuilding, scriptFile: ${scriptFile}, buildFile: ${buildFile}`);

                        const buildCmd = build ? setTemplate(build, templateData) : '';
                        const runCmd = setTemplate(cmd, templateData);
                        
                        this.log(`Script length: ${script.length} chars`);
                        this.log(`Build command: ${buildCmd}`);
                        this.log(`Run command: ${runCmd}`);
                        
                        // Write script to file
                        try {
                            await writeFile(scriptFile, script, 'utf8');
                            this.log(`Script written to ${scriptFile}`);
                        } catch (writeErr) {
                            throw new Error(`Failed to write script file: ${writeErr}`);
                        }

                        if (buildCmd && buildCmd.trim()) {
                            await buildScript(scriptFile, buildFile, buildCmd, script, cwd);
                        }

                        // Parse and cache runtime command
                        const cmdParts = runCmd.trim().split(/\s+/);
                        if (cmdParts.length === 0) {
                            throw new Error('Empty runtime command');
                        }
                        
                        mainCmd = cmdParts[0];
                        cmdArgs = cmdParts.slice(1);
                        
                        // Save cache with parsed command
                        try {
                            const newCache: CacheMetadata = {
                                updated: updated,
                                runCmd: cmd,
                                mainCmd: mainCmd,
                                cmdArgs: cmdArgs
                            };
                            await writeFile(cacheFile, JSON.stringify(newCache, null, 2), 'utf8');
                            this.log(`Cache metadata saved to ${cacheFile}`);
                        } catch (cacheErr) {
                            this.warn(`Failed to save cache metadata: ${cacheErr}`);
                        }
                    } else {
                        this.log(`Cache hit - using existing files`);
                        // Use cached command from previous build
                        if (cache.mainCmd && cache.cmdArgs) {
                            mainCmd = cache.mainCmd;
                            cmdArgs = cache.cmdArgs;
                        } else {
                            // Fallback: parse runtime command if cache doesn't have it
                            const runCmd = setTemplate(cmd, templateData);
                            const cmdParts = runCmd.trim().split(/\s+/);
                            if (cmdParts.length === 0) {
                                throw new Error('Empty runtime command');
                            }
                            mainCmd = cmdParts[0];
                            cmdArgs = cmdParts.slice(1);
                        }
                    }
                }
                
                const spawnOptions: SpawnOptionsWithoutStdio = {
                    cwd,
                    env: env ? { ...process.env } : {},
                    stdio: ['pipe', 'pipe', 'pipe']
                };
                
                this.log(`Spawning: ${mainCmd} with args: ${JSON.stringify(cmdArgs)}`);
                const cp = spawn(mainCmd, cmdArgs, spawnOptions);

                (cp as any).toJSON = () => null;

                const start = Date.now();
                const exec: ExecData = {
                    out: [],
                    err: [],
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
                        
                        // Keep cache files for next execution
                        this.log(`Execution completed - cache files preserved`);
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
                        
                        // Keep cache files even on error
                        this.log(`Error occurred - cache files preserved`);
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