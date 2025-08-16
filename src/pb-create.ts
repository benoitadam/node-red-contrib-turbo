import { NodeAPI, Node, NodeDef } from 'node-red';
import { isObject, isString, pbWithRetry, propError } from './common';

export interface PBCreateNodeDef extends NodeDef {
    name: string;
    collection: string;
    expand: string;
    json: string;
}

module.exports = (RED: NodeAPI) => {
    const PBCreateNode = function(this: Node, def: PBCreateNodeDef) {
        RED.nodes.createNode(this, def);

        this.on('input', async (msg: any) => {
            try {
                
                let data = msg.payload;
                if (def.json && def.json.trim()) {
                    try {
                        data = JSON.parse(def.json);
                    } catch (jsonError) {
                        throw new Error(`Invalid JSON in configuration: ${jsonError}`);
                    }
                }
                
                const collection = def.collection || msg.collection || '';
                const expand = def.expand || msg.expand || '';

                if (!isString(collection)) throw propError('Collection');
                if (!isObject(data)) throw propError('Record data');

                this.debug(`PB Create: ${collection} expand='${expand}'`);

                const result = await pbWithRetry(this, msg, async (pb) => {
                    return await pb.collection(collection).create(data, { expand });
                });

                msg.payload = result;
                this.send(msg);

            } catch (error) {
                this.error(`PB Create failed: ${error}`, msg);
            }
        });
    }
    
    RED.nodes.registerType("pb-create", PBCreateNode);
};