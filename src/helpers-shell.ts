import { NodeAPI, Node, NodeDef } from 'node-red';
import { exec, spawn, ChildProcess } from 'child_process';

export interface HelpersShellNodeDef extends NodeDef {
    name: string;
    script: string;
    mode: 'exec' | 'spawn';
    timeout: number;
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
                    killSignal: 'SIGTERM'
                }, (error, stdout, stderr) => {
                    runningProcesses.delete(execProcess);
                    
                    const success = error === null;
                    const code = error?.code || 0;
                    
                    const result = {
                        ...msg,
                        payload: {
                            out: stdout,
                            err: stderr,
                            success: success,
                            code: code
                        }
                    };
                    
                    if (error && error.killed && error.signal === 'SIGTERM') {
                        result.payload.err += `\nProcess killed due to timeout (${timeoutSeconds}s)`;
                    }
                    
                    this.send(result);
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
                    const stdoutMsg = {
                        ...msg,
                        payload: data.toString()
                    };
                    this.send([stdoutMsg, null, null]);
                });
                
                // Handle stderr - Output 2
                spawnProcess.stderr?.on('data', (data) => {
                    const stderrMsg = {
                        ...msg,
                        payload: data.toString()
                    };
                    this.send([null, stderrMsg, null]);
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