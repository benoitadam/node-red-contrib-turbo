import { NodeAPI, Node, NodeDef } from 'node-red';
import { exec, spawn, ChildProcess } from 'child_process';

export interface HelpersShellNodeDef extends NodeDef {
    name: string;
    script: string;
    mode: 'exec' | 'spawn';
    timeout: number;
    outputFormat: 'text' | 'buffer' | 'json' | 'list' | 'split';
}

module.exports = (RED: NodeAPI) => {
    const HelpersShellNode = function(this: Node, def: HelpersShellNodeDef) {
        RED.nodes.createNode(this, def);
        
        // Store running processes for cleanup
        const runningProcesses = new Set<ChildProcess>();
        
        // Cleanup on node close
        this.on('close', () => {
            runningProcesses.forEach(process => {
                try {
                    process.kill('SIGTERM');
                } catch (err) {
                    // Process may already be dead
                }
            });
            runningProcesses.clear();
        });
        
        // Helper function to format output based on outputFormat
        const formatOutput = (data: string | Buffer): any => {
            const format = def.outputFormat || 'text';
            
            switch (format) {
                case 'buffer':
                    return Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
                case 'json':
                    const textData = Buffer.isBuffer(data) ? data.toString('utf8') : data;
                    try {
                        return JSON.parse(textData);
                    } catch (e) {
                        return textData; // Fallback to text if not valid JSON
                    }
                case 'list':
                    const listText = Buffer.isBuffer(data) ? data.toString('utf8') : data;
                    return listText.split('\n').filter(line => line.trim() !== '');
                case 'split':
                    // For split mode, we'll handle this differently in the caller
                    return Buffer.isBuffer(data) ? data.toString('utf8') : data;
                case 'text':
                default:
                    return Buffer.isBuffer(data) ? data.toString('utf8') : data;
            }
        };

        this.on('input', (msg: any) => {
            const script = def.script || '';
            const mode = def.mode || 'exec';
            const timeoutSeconds = def.timeout || 30;
            const timeoutMs = timeoutSeconds * 1000;
            
            if (!script.trim()) {
                this.error('Script is required');
                return;
            }

            if (mode === 'exec') {
                // Exec Mode: Single output with complete result
                const execProcess = exec(script, {
                    timeout: timeoutMs,
                    maxBuffer: 10 * 1024 * 1024, // 10MB buffer
                    killSignal: 'SIGTERM',
                    encoding: def.outputFormat === 'buffer' ? 'buffer' : 'utf8'
                }, (error, stdout, stderr) => {
                    runningProcesses.delete(execProcess);
                    
                    const success = error === null;
                    const code = error?.code || 0;
                    
                    if (def.outputFormat === 'split') {
                        // Split mode: send one message per line
                        const stdoutText = Buffer.isBuffer(stdout) ? stdout.toString('utf8') : stdout;
                        const stderrText = Buffer.isBuffer(stderr) ? stderr.toString('utf8') : stderr;
                        
                        const stdoutLines = stdoutText.split('\n').filter(line => line.trim() !== '');
                        const stderrLines = stderrText.split('\n').filter(line => line.trim() !== '');
                        
                        // Send stdout lines
                        stdoutLines.forEach(line => {
                            this.send({
                                ...msg,
                                payload: {
                                    out: line,
                                    err: '',
                                    success: success,
                                    code: code
                                }
                            });
                        });
                        
                        // Send stderr lines
                        stderrLines.forEach(line => {
                            this.send({
                                ...msg,
                                payload: {
                                    out: '',
                                    err: line,
                                    success: success,
                                    code: code
                                }
                            });
                        });
                        
                        // Send final result message if no output lines
                        if (stdoutLines.length === 0 && stderrLines.length === 0) {
                            this.send({
                                ...msg,
                                payload: {
                                    out: '',
                                    err: error && error.killed && error.signal === 'SIGTERM' 
                                        ? `Process killed due to timeout (${timeoutSeconds}s)` : '',
                                    success: success,
                                    code: code
                                }
                            });
                        }
                    } else {
                        // Standard mode: single message
                        const result = {
                            ...msg,
                            payload: {
                                out: formatOutput(stdout),
                                err: formatOutput(stderr),
                                success: success,
                                code: code
                            }
                        };
                        
                        if (error && error.killed && error.signal === 'SIGTERM') {
                            const timeoutMsg = `\nProcess killed due to timeout (${timeoutSeconds}s)`;
                            result.payload.err = def.outputFormat === 'buffer' 
                                ? Buffer.concat([Buffer.isBuffer(stderr) ? stderr : Buffer.from(stderr), Buffer.from(timeoutMsg)])
                                : formatOutput(stderr + timeoutMsg);
                        }
                        
                        this.send(result);
                    }
                });
                
                runningProcesses.add(execProcess);
                
            } else {
                // Spawn Mode: 3 outputs for streaming
                const args = ['-c', script];
                const shell = process.platform === 'win32' ? 'cmd' : '/bin/sh';
                const shellArgs = process.platform === 'win32' ? ['/c', script] : args;
                
                const spawnProcess = spawn(shell, shellArgs, {
                    stdio: ['pipe', 'pipe', 'pipe']
                });
                
                runningProcesses.add(spawnProcess);
                
                // Set up timeout
                const timeout = setTimeout(() => {
                    spawnProcess.kill('SIGTERM');
                    
                    // Send timeout error to stderr output
                    const timeoutMsg = {
                        ...msg,
                        payload: `Process killed due to timeout (${timeoutSeconds}s)\n`
                    };
                    this.send([null, timeoutMsg, null]);
                }, timeoutMs);
                
                // Handle stdout - Output 1
                spawnProcess.stdout?.on('data', (data) => {
                    if (def.outputFormat === 'split') {
                        // Split mode: send one message per line
                        const text: string = Buffer.isBuffer(data) ? data.toString('utf8') : data;
                        const lines = text.split('\n').filter((line) => line.trim() !== '');
                        lines.forEach(line => {
                            const stdoutMsg = {
                                ...msg,
                                payload: line
                            };
                            this.send([stdoutMsg, null, null]);
                        });
                    } else {
                        const stdoutMsg = {
                            ...msg,
                            payload: formatOutput(data)
                        };
                        this.send([stdoutMsg, null, null]);
                    }
                });
                
                // Handle stderr - Output 2
                spawnProcess.stderr?.on('data', (data) => {
                    if (def.outputFormat === 'split') {
                        // Split mode: send one message per line
                        const text: string = Buffer.isBuffer(data) ? data.toString('utf8') : data;
                        const lines = text.split('\n').filter(line => line.trim() !== '');
                        lines.forEach(line => {
                            const stderrMsg = {
                                ...msg,
                                payload: line
                            };
                            this.send([null, stderrMsg, null]);
                        });
                    } else {
                        const stderrMsg = {
                            ...msg,
                            payload: formatOutput(data)
                        };
                        this.send([null, stderrMsg, null]);
                    }
                });
                
                // Handle process completion - Output 3
                spawnProcess.on('close', (code, signal) => {
                    clearTimeout(timeout);
                    runningProcesses.delete(spawnProcess);
                    
                    const success = code === 0 && signal === null;
                    const actualCode = code !== null ? code : (signal ? -1 : 0);
                    
                    const resultMsg = {
                        ...msg,
                        payload: {
                            success: success,
                            code: actualCode,
                            signal: signal
                        }
                    };
                    
                    this.send([null, null, resultMsg]);
                });
                
                // Handle spawn errors
                spawnProcess.on('error', (error) => {
                    clearTimeout(timeout);
                    runningProcesses.delete(spawnProcess);
                    
                    const errorMsg = {
                        ...msg,
                        payload: `Spawn error: ${error.message}\n`
                    };
                    this.send([null, errorMsg, null]);
                    
                    const resultMsg = {
                        ...msg,
                        payload: {
                            success: false,
                            code: -1,
                            error: error.message
                        }
                    };
                    this.send([null, null, resultMsg]);
                });
            }
        });
    }
    
    RED.nodes.registerType("helpers-shell", HelpersShellNode);
};