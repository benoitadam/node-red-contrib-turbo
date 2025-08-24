import { NodeAPI, Node, NodeDef } from 'node-red';
import * as vm from 'vm';

export interface TurboTypeScriptNodeDef extends NodeDef {
    name: string;
    script: string;
    outputs: number;
    useFunction: boolean;
}

interface Compilation {
    script: string;
    useFunction: boolean;
    exec: (msg: any) => Promise<any[]>,
}

function compileTypeScript(node: Node, script: string): string {
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

function newCompilation(node: Node, script: string, useFunction: boolean, RED: any): Compilation|undefined {
    node.log(`TS: New Compilation (useFunction:${useFunction})`);
    node.log(script);

    if (!script || script.trim().length === 0) {
        node.warn('TS: Empty script provided');
        return;
    }
    
    const compiledCode = compileTypeScript(node, `(async function() { ${script} })()`);
    node.log(`TS: compiledCode : \n${compiledCode}`);
    
    const ctx: any = {
        msg: {},
        fs: require('fs/promises'),
        path: require('path'),
        os: require('os'),
        crypto: require('crypto'),
        util: require('util'),
        Buffer: Buffer,
        fetch: global.fetch || require('node-fetch').default,
        node,
        RED,
        global,
    };

    let exec: (msg: any) => Promise<any[]>;

    if (useFunction) {
        const funArgs = Object.keys(ctx);
        const fun = new Function(...funArgs, `return ${compiledCode}`);
        
        exec = async (msg) => {
            ctx.msg = msg;
            const args = funArgs.map(k => ctx[k]);
            const outputs = fun(...args) as Promise<any[]>;
            return outputs;
        }
    }
    else {
        const vmCtx = vm.createContext(ctx);

        exec = async (msg) => {
            vmCtx.msg = msg;
            const outputs = vm.runInContext(compiledCode, vmCtx, {
                timeout: 30000, // 30 second timeout
                displayErrors: true
            });
            return outputs;
        }
    }
    return { script, useFunction, exec };
}

module.exports = (RED: NodeAPI) => {
    const TurboTypeScriptNode = function(this: Node, def: TurboTypeScriptNodeDef) {
        RED.nodes.createNode(this, def);
        
        let cache: Record<string, Compilation | undefined> = {};
        
        this.log('turbo-ts ready');
        
        this.on('input', async (msg: any) => {
            try {
                const script: string = def.script || '';
                const useFunction: boolean = def.useFunction !== false;

                let comp = cache[this.id];

                if (
                    !comp ||
                    comp.script !== script ||
                    comp.useFunction !== useFunction
                ) {
                    try {
                        comp = newCompilation(this, script, useFunction, RED);
                        if (!comp) return;
                        cache[this.id] = comp;
                        this.log('Script compiled and cached');
                    } catch (error) {
                        this.error(`turbo-ts compilation failed: ${error}`);
                        return;
                    }
                }
                
                const outputs = await comp.exec(msg);
                this.send(outputs);

            } catch (error: any) {
                this.error(`turbo-ts error: ${error.message}`);
            }
        });
        
        // Clean up cache on node close
        this.on('close', () => {
            this.log('Cleaning up turbo-ts node...');
            cache = {};
        });
    };
    
    RED.nodes.registerType("turbo-ts", TurboTypeScriptNode);
};