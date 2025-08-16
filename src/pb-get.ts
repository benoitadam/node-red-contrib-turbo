import { NodeAPI, Node, NodeDef } from 'node-red';
import { isString, pbWithRetry, propError } from './common';

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
                const p = msg.payload || {};
                const collection = def.collection || msg.collection || p.collectionName;
                const id = def.recordId || msg.recordId || p.id;
                const expand = def.expand || msg.expand || '';

                if (!isString(collection)) throw propError('Collection');
                if (!id) throw propError('Record ID');
                if (!isString(expand)) throw propError('Expand');

                this.debug(`PB Get: ${collection}/${id} expand='${expand}'`);

                const result = await pbWithRetry(this, msg, async (pb) => {
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