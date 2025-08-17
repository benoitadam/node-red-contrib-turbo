import { NodeAPI, Node, NodeDef } from 'node-red';
import { isObject, isString, pbAutoAuth, propError } from './common';
import { SendOptions } from 'pocketbase';

export interface PBSchemaNodeDef extends NodeDef {
    name: string;
    action: string;
    collection: string;
    json: string;
}

module.exports = (RED: NodeAPI) => {
    const PBSchemaNode = function(this: Node, def: PBSchemaNodeDef) {
        RED.nodes.createNode(this, def);
        
        // Statut initial
        this.status({ fill: "grey", shape: "ring", text: "ready" });
        
        this.on('input', async (msg: any) => {
            try {
                const pb = await pbAutoAuth(this, msg);
                
                const action = def.action || msg.action || 'get';
                const collection = def.collection || msg.collection;
                
                let data = msg.payload;
                if (def.json && def.json.trim()) {
                    try {
                        data = JSON.parse(def.json);
                    } catch (jsonError) {
                        throw new Error(`Invalid JSON in configuration: ${jsonError}`);
                    }
                }

                if (!isObject(data)) throw propError('Record data');
                
                if (action !== 'list' && action !== 'create') {
                    if (!isString(collection)) throw propError('Collection');
                }

                console.debug('PB Schema: Action:', action, 'Collection:', collection);
                this.status({ fill: "blue", shape: "dot", text: `${action}...` });
                
                const send = async (method: string, collection: string, options?: Omit<SendOptions, 'method'>) => {
                    const result = await pb.send('/api/collections' + (collection ? `/${collection}` : ''), {
                        method,
                        ...options
                    });
                    msg.payload = result;
                    msg.pb = pb;
                    this.send(msg);
                }
                
                switch (action) {
                    case 'list':
                        await send('GET', '', data ? { query: data } : {});
                        break;
                        
                    case 'get':
                        await send('GET', collection);
                        break;
                        
                    case 'create':
                        await send('POST', '', { body: data });
                        break;
                        
                    case 'update':
                        await send('PATCH', collection, { body: data });
                        break;
                        
                    case 'delete':
                        await send('DELETE', collection);
                        break;
                        
                    case 'truncate':
                        await send('DELETE', `${collection}/truncate`);
                        break;
                        
                    default:
                        throw new Error(`Unknown action: ${action}`);
                }
                
                console.debug('PB Schema: Operation completed successfully');
                this.status({ fill: "green", shape: "dot", text: "success" });
                
            } catch (error) {
                console.error('PB Schema: Operation failed:', error);
                this.status({ fill: "red", shape: "dot", text: "error" });
                this.error(`PB Schema ${def.action || 'operation'} failed: ${error}`, msg);
            }
        });
    }
    
    RED.nodes.registerType("pb-schema", PBSchemaNode);
};