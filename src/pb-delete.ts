import { NodeAPI, Node, NodeDef } from 'node-red';
import { isString, pbRetry, pbPropError } from './common';

export interface PBDeleteNodeDef extends NodeDef {
    name: string;
    collection: string;
    recordId: string;
}

module.exports = (RED: NodeAPI) => {
    const PBDeleteNode = function(this: Node, def: PBDeleteNodeDef) {
        RED.nodes.createNode(this, def);

        this.on('input', async (msg: any) => {
            try {
                const p = msg.payload || {};
                const collection = def.collection || msg.collection || p.collectionName;
                const id = def.recordId || msg.recordId || p.id;

                if (!isString(collection)) throw pbPropError('Collection');
                if (!id) throw pbPropError('Record ID');

                this.debug(`PB Delete: ${collection}/${id}`);

                const isDeleted = await pbRetry(this, msg, async (pb) => {
                    return await pb.collection(collection).delete(id);
                });
                msg.payload = isDeleted;
                this.send(msg);

            } catch (error) {
                this.error(`PB Delete failed: ${error}`, msg);
            }
        });
    }
    
    RED.nodes.registerType("pb-delete", PBDeleteNode);
};