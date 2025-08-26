import { NodeAPI, Node, NodeDef } from 'node-red';
import * as vm from 'vm';
import ts from 'typescript';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import util from 'util';
import process from 'process';

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
        
        const result = ts.transpileModule(script, {
            compilerOptions: {
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
            }
        });
        
        // Check for TypeScript diagnostics
        if (result.diagnostics && result.diagnostics.length > 0) {
            const errors = result.diagnostics.map(diagnostic => {
                const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
                if (diagnostic.file && diagnostic.start !== undefined) {
                    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
                    return `Line ${line + 1}:${character + 1}: ${message}`;
                }
                return message;
            }).join('\n');
            
            node.error(`TypeScript diagnostics:\n${errors}`);
        }
        
        node.log('TypeScript compilation successful');
        return result.outputText;
    } catch (error: any) {
        const json: any = {};
        try {
            json.stack = String(error.stack);
            json.message = String(error.message);
            json.errorKeys = Object.keys(error);
        } catch(e) {}
        try {
            const prototype = Object.getPrototypeOf(error);
            json.prototypeType = String(typeof prototype);
            json.prototypeKeys = Object.keys(prototype);
            json.prototypeName = String(prototype.name);
        } catch(e) {}
        throw new Error(`Compilation failed: ${JSON.stringify(json)}`);
    }
}

function newCompilation(node: Node, script: string, useFunction: boolean, RED: any): Compilation|undefined {
    node.log(`TS: New Compilation (useFunction:${useFunction})`);
    node.log(script);

    if (!script || script.trim().length === 0) {
        throw new Error('Empty script provided');
    }

    const compiledCode = compileTypeScript(node, `(async function() { ${script} })()`);
    
    const ctx: any = {
        msg: {},
        fs,
        path,
        os,
        crypto,
        util,
        process,
        require,
        Buffer: Buffer,
        fetch: global.fetch || require('node-fetch').default,
        node,
        RED,
        __global: global,
        env: {
            get: (envVar: string) => RED.util.getSetting(node, envVar)
        },
        setTimeout: function () {
            var func = arguments[0];
            var timerId: any;
            arguments[0] = function() {
                ctx.clearTimeout(timerId);
                try {
                    func.apply(this,arguments);
                } catch(err) {
                    node.error(err,{});
                }
            };
            timerId = setTimeout.apply(this, arguments as any);
            (node as any).outstandingTimers.push(timerId);
            return timerId;
        },
        clearTimeout: function(id: any) {
            clearTimeout(id);
            var index = (node as any).outstandingTimers.indexOf(id);
            if (index > -1) {
                (node as any).outstandingTimers.splice(index,1);
            }
        },
        setInterval: function() {
            var func = arguments[0];
            var timerId;
            arguments[0] = function() {
                try {
                    func.apply(this,arguments);
                } catch(err) {
                    node.error(err,{});
                }
            };
            timerId = setInterval.apply(this, arguments as any);
            (node as any).outstandingIntervals.push(timerId);
            return timerId;
        },
        clearInterval: function(id: any) {
            clearInterval(id);
            var index = (node as any).outstandingIntervals.indexOf(id);
            if (index > -1) {
                (node as any).outstandingIntervals.splice(index,1);
            }
        }
    };

    let exec: (msg: any) => Promise<any[]>;

    if (useFunction) {
        const funArgs = Object.keys(ctx);
        let fun: Function;
        
        fun = new Function(...funArgs, `return ${compiledCode}`);
        
        exec = async (msg) => {
            ctx.msg = msg;

            const context = node.context();
            ctx.context = context;
            ctx.flow = context.flow;
            ctx.global = context.global;

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
                    comp = newCompilation(this, script, useFunction, RED);
                    if (!comp) return;
                    cache[this.id] = comp;
                    this.log('Script compiled and cached');
                }
                
                const outputs = await comp.exec(msg);
                this.send(outputs);

            } catch (error: any) {
                this.error(error.stack || error.message);
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