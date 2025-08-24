import { NodeAPI, Node, NodeDef } from 'node-red';
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

function checkTypeScriptAPI(node: Node): boolean {
    try {
        require('typescript');
        node.log('TypeScript API available');
        return true;
    } catch (error) {
        node.error('TypeScript API not available - please install typescript');
        return false;
    }
}

function compileTypeScript(script: string, node: Node): string {
    try {
        node.log(`Compiling TypeScript (${script.length} chars)`);
        
        const ts = require('typescript');
        const result = ts.transpile(script, {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.CommonJS,
            moduleResolution: ts.ModuleResolutionKind.NodeJs,
            
            // Maximum permissiveness - allow everything
            allowJs: true,
            allowUnreachableCode: true,
            allowUnusedLabels: true,
            
            // Disable all strict checks
            strict: false,
            noImplicitAny: false,
            noImplicitThis: false,
            noImplicitReturns: false,
            noImplicitUseStrict: false,
            
            // Disable all error checking
            noUnusedLocals: false,
            noUnusedParameters: false,
            exactOptionalPropertyTypes: false,
            noUncheckedIndexedAccess: false,
            noPropertyAccessFromIndexSignature: false,
            
            // Skip all lib and declaration checks
            skipLibCheck: true,
            skipDefaultLibCheck: true,
            
            // Suppress warnings and errors
            suppressExcessPropertyErrors: true,
            suppressImplicitAnyIndexErrors: true,
            
            // Allow all JS features
            allowSyntheticDefaultImports: true,
            allowUmdGlobalAccess: true,
            
            // Disable emit checks
            noEmitOnError: false,
            
            // Maximum compatibility
            downlevelIteration: true,
            importHelpers: false
        });
        
        node.log('TypeScript compilation successful');
        return result;
    } catch (error: any) {
        node.error(`TypeScript compilation error: ${error.message}`);
        throw new Error(`Compilation failed: ${error.message}`);
    }
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
        
        // Initialize TypeScript API on node startup
        const initPromise = Promise.resolve((() => {
            try {
                this.log('Initializing turbo-ts node...');
                const available = checkTypeScriptAPI(this);
                
                if (available) {
                    this.log('turbo-ts ready');
                    return true;
                } else {
                    this.error('Failed to initialize TypeScript API - node will not function');
                    return false;
                }
            } catch (error) {
                this.error(`Initialization error: ${error}`);
                return false;
            }
        })());
        
        this.on('input', async (msg: any) => {
            try {
                // Wait for initialization to complete
                const ready = await initPromise;
                if (!ready) {
                    this.error('Node not ready - TypeScript API initialization failed');
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
                        const compiledCode = compileTypeScript(script, this);
                        
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