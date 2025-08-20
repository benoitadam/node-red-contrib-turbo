import { NodeAPI, Node, NodeDef } from 'node-red';
import { isString, pbRetry, pbPropError } from './common';

export interface PBGetNodeDef extends NodeDef {
    name: string;
    collection: string;
    recordId: string;
    expand: string;
}

module.exports = (RED: NodeAPI) => {
    const PBGetNode = function(this: Node, def: PBGetNodeDef) {
        RED.nodes.createNode(this, def);

        this.on('input', async (msg: any) => {
            try {
                const record = msg.record || msg.payload;
                const collection = def.collection || msg.collection || record.collectionName;
                const id = def.recordId || msg.recordId || record.id;
                const expand = def.expand || msg.expand || '';

                msg.collection = collection;

                if (!isString(collection)) throw pbPropError('Collection');
                if (!id) throw pbPropError('Record ID');
                if (!isString(expand)) throw pbPropError('Expand');

                this.debug(`PB Get: ${collection}/${id} expand='${expand}'`);

                const result = await pbRetry(this, msg, async (pb) => {
                    return await pb.collection(collection).getOne(id, { expand });
                });

                msg.payload = result;
                this.send(msg);

            } catch (error) {
                this.error(`PB Get failed: ${error}`, msg);
            }
        });
    }
    
    RED.nodes.registerType("pb-get", PBGetNode);
};