import { NodeAPI, Node, NodeDef } from 'node-red';
import { spawn } from 'child_process';
import * as vm from 'vm';

export interface TurboTypeScriptNodeDef extends NodeDef {
    name: string;
    script: string;
    outputs: number;
}

interface CompilationCache {
    script: string;
    compiledCode: string;
    context: vm.Context;
    lastCompiled: number;
}

let tscAvailable = false;

async function checkTsc(node: Node): Promise<boolean> {
    return new Promise((resolve) => {
        const child = spawn('tsc', ['--version'], { stdio: 'pipe' });
        
        child.on('close', (code) => {
            if (code === 0) {
                node.log('tsc is available');
                resolve(true);
            } else {
                node.warn('tsc not found, attempting to install globally...');
                installTsc(node).then(resolve).catch(() => resolve(false));
            }
        });
        
        child.on('error', () => {
            node.warn('tsc not found, attempting to install globally...');
            installTsc(node).then(resolve).catch(() => resolve(false));
        });
    });
}

async function installTsc(node: Node): Promise<boolean> {
    return new Promise((resolve) => {
        node.log('Installing typescript globally...');
        const child = spawn('npm', ['install', '-g', 'typescript'], { 
            stdio: ['ignore', 'pipe', 'pipe'] 
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout?.on('data', (data) => {
            stdout += data.toString();
        });
        
        child.stderr?.on('data', (data) => {
            stderr += data.toString();
        });
        
        child.on('close', (code) => {
            if (code === 0) {
                node.log('typescript installed successfully');
                resolve(true);
            } else {
                node.error(`Failed to install typescript: ${stderr}`);
                resolve(false);
            }
        });
        
        child.on('error', (error) => {
            node.error(`Error installing typescript: ${error.message}`);
            resolve(false);
        });
    });
}

async function compileTypeScript(script: string, node: Node): Promise<string> {
    return new Promise((resolve, reject) => {
        node.log(`Compiling TypeScript (${script.length} chars)`);
        
        const child = spawn('tsc', [
            '--target', 'es2020',
            '--module', 'commonjs',
            '--moduleResolution', 'node',
            '--allowJs', 'true',
            '--noImplicitAny', 'false',
            '--strict', 'false',
            '--skipLibCheck', 'true',
            '--outDir', '/tmp',
            '--rootDir', '.',
            '/dev/stdin'
        ], {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout?.on('data', (data) => {
            stdout += data.toString();
        });
        
        child.stderr?.on('data', (data) => {
            stderr += data.toString();
        });
        
        child.on('close', (code) => {
            if (code === 0 || stdout) {
                node.log('TypeScript compilation successful');
                // For tsc, we need to use a different approach since it doesn't output to stdout
                // We'll use TypeScript API instead
                const ts = require('typescript');
                const result = ts.transpile(script, {
                    target: ts.ScriptTarget.ES2020,
                    module: ts.ModuleKind.CommonJS,
                    moduleResolution: ts.ModuleResolutionKind.NodeJs,
                    allowJs: true,
                    noImplicitAny: false,
                    strict: false,
                    skipLibCheck: true
                });
                resolve(result);
            } else {
                node.error(`TypeScript compilation failed: ${stderr}`);
                reject(new Error(`Compilation failed: ${stderr}`));
            }
        });
        
        child.on('error', (error) => {
            node.error(`tsc spawn error: ${error.message}`);
            // Fallback to TypeScript API
            try {
                const ts = require('typescript');
                const result = ts.transpile(script, {
                    target: ts.ScriptTarget.ES2020,
                    module: ts.ModuleKind.CommonJS,
                    moduleResolution: ts.ModuleResolutionKind.NodeJs,
                    allowJs: true,
                    noImplicitAny: false,
                    strict: false,
                    skipLibCheck: true
                });
                node.log('Used TypeScript API as fallback');
                resolve(result);
            } catch (tsError) {
                reject(new Error(`TypeScript compilation error: ${tsError}`));
            }
        });
        
        if (child.stdin) {
            child.stdin.write(script);
            child.stdin.end();
        }
    });
}

function createNodeRedContext(msg: any, node: Node, RED: NodeAPI): vm.Context {
    const context = vm.createContext({
        // Full Node-RED context
        ...global,
        msg,
        node,
        RED,
        
        // Results container
        __results: [],
        __send: (output: any, outputIndex: number = 0) => {
            if (!context.__results) context.__results = [];
            context.__results[outputIndex] = output;
        }
    });
    
    return context;
}

module.exports = (RED: NodeAPI) => {
    const TurboTypeScriptNode = function(this: Node, def: TurboTypeScriptNodeDef) {
        RED.nodes.createNode(this, def);
        
        const cache = new Map<string, CompilationCache>();
        
        // Initialize esbuild on node startup
        const initPromise = (async () => {
            try {
                this.log('Initializing turbo-ts node...');
                tscAvailable = await checkTsc(this);
                
                if (tscAvailable) {
                    this.log('turbo-ts ready');
                    return true;
                } else {
                    this.error('Failed to initialize tsc - node will not function');
                    return false;
                }
            } catch (error) {
                this.error(`Initialization error: ${error}`);
                return false;
            }
        })();
        
        this.on('input', async (msg: any) => {
            try {
                // Wait for initialization to complete
                const ready = await initPromise;
                if (!ready) {
                    this.error('Node not ready - tsc initialization failed');
                    return;
                }
                
                let script: string = def.script || msg.script || '';
                const outputs: number = def.outputs || msg.outputs || 1;
                
                this.log(`Processing input with ${outputs} outputs`);
                
                if (!script || script.trim() === '') {
                    this.warn('Empty script provided');
                    return;
                }
                
                this.log(`Processing script: ${script.length} chars`);
                
                // Check cache
                const cacheKey = script;
                let compilationCache = cache.get(cacheKey);
                
                if (!compilationCache || Date.now() - compilationCache.lastCompiled > 60000) {
                    this.log('Compiling TypeScript script...');
                    
                    try {
                        const compiledCode = await compileTypeScript(script, this);
                        
                        // Wrap compiled code to capture results
                        const wrappedCode = `
                            (function() {
                                ${compiledCode}
                                return __results;
                            })();
                        `;
                        
                        const context = createNodeRedContext(msg, this, RED);
                        
                        compilationCache = {
                            script,
                            compiledCode: wrappedCode,
                            context,
                            lastCompiled: Date.now()
                        };
                        
                        cache.set(cacheKey, compilationCache);
                        this.log('Script compiled and cached');
                        
                    } catch (compileError) {
                        this.error(`Compilation failed: ${compileError}`);
                        return;
                    }
                } else {
                    this.log('Using cached compilation');
                    // Update context with new message
                    compilationCache.context.msg = msg;
                    compilationCache.context.__results = [];
                }
                
                // Execute compiled code in VM
                try {
                    this.log('Executing compiled code...');
                    const startTime = Date.now();
                    
                    const results = vm.runInContext(
                        compilationCache.compiledCode,
                        compilationCache.context,
                        {
                            timeout: 30000, // 30 second timeout
                            displayErrors: true
                        }
                    );
                    
                    const executionTime = Date.now() - startTime;
                    this.log(`Execution completed in ${executionTime}ms`);
                    
                    // Prepare outputs
                    const outputMsgs: any[] = [];
                    
                    for (let i = 0; i < outputs; i++) {
                        const result = results && results[i] !== undefined ? results[i] : null;
                        
                        if (result !== null) {
                            outputMsgs[i] = {
                                ...msg,
                                payload: result,
                                topic: `output-${i}`,
                                _executionTime: executionTime
                            };
                        } else {
                            outputMsgs[i] = null;
                        }
                    }
                    
                    // If no explicit outputs were set, send result to first output
                    if (outputMsgs.every(o => o === null)) {
                        outputMsgs[0] = {
                            ...msg,
                            payload: results,
                            _executionTime: executionTime
                        };
                    }
                    
                    this.send(outputMsgs);
                    this.log(`Sent results to ${outputMsgs.filter(o => o !== null).length} outputs`);
                    
                } catch (execError: any) {
                    this.error(`Execution error: ${execError.message}`);
                    
                    // Send error to first output
                    const errorMsg = {
                        ...msg,
                        payload: null,
                        error: execError.message,
                        topic: 'error'
                    };
                    
                    this.send([errorMsg, ...Array(outputs - 1).fill(null)]);
                }
                
            } catch (error: any) {
                this.error(`turbo-ts error: ${error.message}`);
            }
        });
        
        // Clean up cache on node close
        this.on('close', () => {
            this.log('Cleaning up turbo-ts node...');
            cache.clear();
        });
    };
    
    RED.nodes.registerType("turbo-ts", TurboTypeScriptNode);
};