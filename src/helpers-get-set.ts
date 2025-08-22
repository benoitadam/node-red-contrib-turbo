import { NodeAPI, Node, NodeDef } from 'node-red';
import { getPath, setPath } from './common';

export interface HelpersGetNodeDef extends NodeDef {
    name: string;
    source: string;
    target: string;
    value: string;
}

module.exports = (RED: NodeAPI) => {
    const HelpersGetNode = function(this: Node, def: HelpersGetNodeDef) {
        RED.nodes.createNode(this, def);

        this.on('input', (msg: any) => {
            const target = def.target || 'payload';
            const source = def.source || 'payload';
            const value = def.value || '';

            if (!value) {
                setPath(msg, target, getPath(msg, source));
                this.send(msg);
                return;
            }

            setPath(msg, target, value);            
            this.send(msg);
        });
    }
    
    RED.nodes.registerType("helpers-get-set", HelpersGetNode);
};