import { NodeAPI, Node, NodeDef } from 'node-red';
import { pbAuth, isObject, PBInfo, getPBAuth, pbClient } from './common';

export interface PBAuthNodeDef extends NodeDef, PBInfo {
    name: string;
}

module.exports = (RED: NodeAPI) => {
    const PBAuthNode = function(this: Node, def: PBAuthNodeDef) {
        RED.nodes.createNode(this, def);

        this.on('input', async (msg: any) => {
            try {
                const o = isObject(msg.payload) ? { ...msg.payload, ...def } : def;
                await pbAuth(msg, o);
                this.send(msg);
            } catch (error) {
                this.error(`PB Auth failed: ${error}`, msg);
            }
        });
    }
    
    RED.nodes.registerType("pb-auth", PBAuthNode);
};