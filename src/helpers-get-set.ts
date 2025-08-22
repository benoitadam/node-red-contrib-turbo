import { NodeAPI, Node, NodeDef } from 'node-red';
import { getPath, setPath, setTemplate } from './common';

export interface HelpersGetNodeDef extends NodeDef {
    name: string;
    source: string;
    target: string;
    content: string;
    mode: 'path' | 'json' | 'jsonTemplate' | 'text' | 'textTemplate';
}

module.exports = (RED: NodeAPI) => {
    const HelpersGetNode = function(this: Node, def: HelpersGetNodeDef) {
        RED.nodes.createNode(this, def);

        this.on('input', (msg: any) => {
            const target = def.target || 'payload';
            const source = def.source || 'payload';
            const content = def.content || '';
            const mode = def.mode || 'path';

            let value = undefined;

            switch (mode) {
                case 'path':
                    value = getPath(msg, source);
                    break;
                case 'json':
                    value = JSON.parse(content);
                    break;
                case 'text':
                    value = content;
                    break;
                case 'jsonTemplate':
                    value = JSON.parse(setTemplate(content, msg));
                    break;
                case 'textTemplate':
                    value = setTemplate(content, msg);
                    break;
                default:
                    throw new Error('not-implemented mode');
            }

            setPath(msg, target, value);
            this.send(msg);
        });
    }
    
    RED.nodes.registerType("helpers-get-set", HelpersGetNode);
};