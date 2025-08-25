import { NodeAPI, Node, NodeDef } from 'node-red';
import { getPath, setPath, setTemplate } from './common';

export interface TurboSetNodeDef extends NodeDef {
    name: string;
    source: string;
    target: string;
    content: string;
    mode: 'path' | 'json' | 'jsonTemplate' | 'text' | 'textTemplate';
}

module.exports = (RED: NodeAPI) => {
    const TurboSetNode = function(this: Node, def: TurboSetNodeDef) {
        RED.nodes.createNode(this, def);

        this.on('input', (msg: any) => {
            const target = def.target || 'payload';
            const source = def.source || 'payload';
            const mode = def.mode || 'path';
            const content = def.content;

            try {
                let value: any = '';

                switch (mode) {
                    case 'path':
                        value = getPath(msg, source);
                        break;
                    case 'json':
                        if (content) value = JSON.parse(content);
                        break;
                    case 'text':
                        value = content;
                        break;
                    case 'jsonTemplate':
                        if (content) value = JSON.parse(setTemplate(content, msg));
                        break;
                    case 'textTemplate':
                        if (content) value = setTemplate(content, msg);
                        break;
                    default:
                        this.error(`Unsupported mode: ${mode}`);
                        return;
                }

                msg = setPath(msg, target, value);
                this.send(msg);
            } catch (err) {
                this.error(`Processing error in mode '${mode}': ${err instanceof Error ? err.message : String(err)}`);
                return;
            }
        });
    }
    
    RED.nodes.registerType("turbo-set", TurboSetNode);
};