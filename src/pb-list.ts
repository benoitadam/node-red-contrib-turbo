import { NodeAPI, Node, NodeDef } from 'node-red';
import { isSafeNumber, isString, pbRetry, pbPropError } from './common';

export interface PBListNodeDef extends NodeDef {
    name: string;
    collection: string;
    page: number;
    perPage: number;
    filter: string;
    sort: string;
    expand: string;
    mode: 'page' | 'items' | 'split' | 'first';
}

module.exports = (RED: NodeAPI) => {
    const PBListNode = function(this: Node, def: PBListNodeDef) {
        RED.nodes.createNode(this, def);

        this.on('input', async (msg: any) => {
            try {
                const record = msg.record || msg.payload;
                const collection = def.collection || msg.collection || record.collectionName;
                const page = Number(def.page || msg.page || 1);
                const perPage = Number(def.perPage || msg.perPage || 50);
                const filter = def.filter || msg.filter || '';
                const sort = def.sort || msg.sort || '';
                const expand = def.expand || msg.expand || '';
                const mode = def.mode || msg.mode || 'page';

                msg.collection = collection;

                if (!isString(collection)) throw pbPropError('Collection');
                if (mode !== 'first') {
                    if (!isSafeNumber(page) || page < 1) throw pbPropError('Page');
                    if (!isSafeNumber(perPage) || perPage < 1 || perPage > 99999) throw pbPropError('Per Page');
                }
                if (!isString(filter)) throw pbPropError('Filter');
                if (!isString(sort)) throw pbPropError('Sort');
                if (!isString(mode)) throw pbPropError('Mode');

                this.debug(`PB List: ${collection} page=${page} perPage=${perPage} filter='${filter}' sort='${sort}' mode=${mode}`);

                if (mode === 'first') {
                    const result = await pbRetry(this, msg, async (pb) => {
                        return await pb.collection(collection).getList(1, 1, {
                            filter,
                            sort,
                            expand
                        });
                    });
                    const record = result.items[0] || null;
                    msg.payload = record
                    msg.recordId = record && record.id;
                    this.send(msg);
                } else {
                    const result = await pbRetry(this, msg, async (pb) => {
                        return await pb.collection(collection).getList(page, perPage, {
                            filter,
                            sort,
                            expand
                        });
                    });
                    
                    if (mode === 'page') {
                        msg.payload = result;
                        this.send(msg);
                    } else if (mode === 'items') {
                        msg.payload = result.items;
                        this.send(msg);
                    } else if (mode === 'split') {
                        result.items.forEach((record) => {
                            const newMsg = RED.util.cloneMessage(msg);
                            newMsg.payload = record;
                            newMsg.recordId = record.id;
                            this.send(newMsg);
                        });
                    }
                }

            } catch (error) {
                this.error(`PB List failed: ${error}`, msg);
            }
        });
    }
    
    RED.nodes.registerType("pb-list", PBListNode);
};