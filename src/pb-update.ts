import { NodeAPI, Node, NodeDef } from 'node-red';
import { isObject, isString, pbWithRetry, propError } from './common';

export interface PBUpdateNodeDef extends NodeDef {
    name: string;
    collection: string;
    recordId: string;
    expand: string;
    json: string;
}

module.exports = (RED: NodeAPI) => {
    const PBUpdateNode = function(this: Node, def: PBUpdateNodeDef) {
        RED.nodes.createNode(this, def);

        this.on('input', async (msg: any) => {
            try {
                const collection = def.collection || msg.collection;
                const id = def.recordId || msg.recordId;
                const expand = def.expand || msg.expand || '';

                let data = msg.payload;
                if (def.json && def.json.trim()) {
                    try {
                        data = JSON.parse(def.json);
                    } catch (jsonError) {
                        throw new Error(`Invalid JSON in configuration: ${jsonError}`);
                    }
                }

                if (!isString(collection)) throw propError('Collection');
                if (!isString(id)) throw propError('Record ID');
                if (!isString(expand)) throw propError('Expand');
                if (!isObject(data)) throw propError('Record data');

                this.debug(`PB Update: ${collection}/${id} expand='${expand}'`);

                const result = await pbWithRetry(this, msg, async (pb) => {
                    return await pb.collection(collection).update(id, data, { expand });
                });

                msg.payload = result;
                this.send(msg);

            } catch (error) {
                this.error(`PB Update failed: ${error}`, msg);
            }
        });
    }
    
    RED.nodes.registerType("pb-update", PBUpdateNode);
};