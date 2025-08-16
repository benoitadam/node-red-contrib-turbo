import { NodeAPI, Node, NodeDef } from 'node-red';
import { isNumber, isString, pbWithRetry, propError } from './common';

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

                const collection = def.collection || msg.collection;
                const page = Number(def.page || msg.page || 1);
                const perPage = Number(def.perPage || msg.perPage || 50);
                const filter = def.filter || msg.filter || '';
                const sort = def.sort || msg.sort || '';
                const expand = def.expand || msg.expand || '';
                const mode = def.mode || msg.mode || 'page';

                if (!isString(collection)) throw propError('Collection');
                if (mode !== 'first') {
                    if (!isNumber(page) || page < 1) throw propError('Page');
                    if (!isNumber(perPage) || perPage < 1 || perPage > 99999) throw propError('Per Page');
                }
                if (!isString(filter)) throw propError('Filter');
                if (!isString(sort)) throw propError('Sort');
                if (!isString(mode)) throw propError('Mode');

                this.debug(`PB List: ${collection} page=${page} perPage=${perPage} filter='${filter}' sort='${sort}' mode=${mode}`);

                if (mode === 'first') {
                    const result = await pbWithRetry(this, msg, async (pb) => {
                        return await pb.collection(collection).getList(1, 1, {
                            filter,
                            sort,
                            expand
                        });
                    });
                    msg.payload = result.items[0] || null;
                    this.send(msg);
                } else {
                    const result = await pbWithRetry(this, msg, async (pb) => {
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
                        result.items.forEach((item) => {
                            const newMsg = RED.util.cloneMessage(msg);
                            newMsg.payload = item;
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