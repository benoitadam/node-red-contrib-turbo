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


module.exports = (RED: NodeAPI) => {
    const TurboTypeScriptNode = function(this: Node, def: TurboTypeScriptNodeDef) {
        RED.nodes.createNode(this, def);
        
        const cache = new Map<string, CompilationCache>();
        
        this.log('turbo-ts ready');
        
        this.on('input', async (msg: any) => {
            try {
                
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
                        // Wrap script in async function before compilation
                        const wrappedScript = `(async function() { ${script} })()`;
                        const compiledCode = compileTypeScript(wrappedScript, this);
                        
                        const context = vm.createContext({
                            // Full Node-RED context
                            ...global,
                            msg,
                            node: this,
                            RED,
                            
                            // Common Node.js modules (instead of imports)
                            fs: require('fs/promises'),
                            path: require('path'),
                            os: require('os'),
                            crypto: require('crypto'),
                            util: require('util'),
                            
                            // Fetch API
                            fetch: global.fetch || require('node-fetch').default
                        });
                        
                        compilationCache = {
                            script,
                            compiledCode,
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
                }
                
                // Execute compiled code in VM
                try {
                    this.log('Executing compiled code...');
                    const startTime = Date.now();
                    
                    const promise = vm.runInContext(
                        compilationCache.compiledCode,
                        compilationCache.context,
                        {
                            timeout: 30000, // 30 second timeout
                            displayErrors: true
                        }
                    );
                    
                    // Await the promise result
                    const results = await promise;
                    
                    const executionTime = Date.now() - startTime;
                    this.log(`Execution completed in ${executionTime}ms`);
                    
                    // Handle multiple outputs with array return or single output
                    let outputMsgs: any[];
                    
                    if (Array.isArray(results)) {
                        // Multiple outputs: return [msg1, msg2, msg3]
                        outputMsgs = results.slice(0, outputs).map((result, i) => {
                            if (result === null || result === undefined) {
                                return null;
                            }
                            return {
                                ...result,
                                _executionTime: executionTime
                            };
                        });
                        
                        // Fill remaining outputs with null if needed
                        while (outputMsgs.length < outputs) {
                            outputMsgs.push(null);
                        }
                    } else {
                        // Single output: return msg
                        outputMsgs = [{
                            ...results,
                            _executionTime: executionTime
                        }];
                        
                        // Fill remaining outputs with null
                        while (outputMsgs.length < outputs) {
                            outputMsgs.push(null);
                        }
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