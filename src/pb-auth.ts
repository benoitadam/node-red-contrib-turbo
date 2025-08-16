import { NodeAPI, Node, NodeDef } from 'node-red';
import { pbAuth, pbAuthInfo, PBAuth } from './common';

export interface PBAuthNodeDef extends NodeDef, PBAuth {
    name: string;
}

module.exports = (RED: NodeAPI) => {
    const PBAuthNode = function(this: Node, def: PBAuthNodeDef) {
        RED.nodes.createNode(this, def);

        this.on('input', async (msg: any) => {
            try {
                const info = pbAuthInfo(this, { ...def, ...msg.pbAuth, ...msg.payload });
                const { pb, auth } = await pbAuth(this, info);
                msg.pbAuth = auth;
                msg.pb = pb;
                this.send(msg);
            } catch (error) {
                this.error(`PB Auth failed: ${error}`, msg);
            }
        });
    }
    
    RED.nodes.registerType("pb-auth", PBAuthNode);
};