import { NodeAPI, Node, NodeDef } from 'node-red';
import { isString, pbRetry, pbPropError } from './common';

export interface PBDownloadNodeDef extends NodeDef {
    name: string;
    collection: string;
    recordId: string;
    filename: string;
    mode: 'buffer' | 'base64' | 'url';
}

module.exports = (RED: NodeAPI) => {
    const PBDownloadNode = function(this: Node, def: PBDownloadNodeDef) {
        RED.nodes.createNode(this, def);

        this.on('input', async (msg: any) => {
            try {
                const p = msg.payload || {};
                const collection = def.collection || msg.collection || p.collectionName;
                const recordId = def.recordId || msg.recordId || p.id;
                const filename = def.filename || msg.filename || p.filename;
                const mode = def.mode || msg.mode || 'buffer';

                if (!isString(collection)) throw pbPropError('Collection');
                if (!recordId) throw pbPropError('Record ID');
                if (!filename) throw pbPropError('Filename');
                if (!['buffer', 'base64', 'url'].includes(mode)) throw pbPropError('Mode (buffer|base64|url)');

                this.debug(`PB Download: ${collection}/${recordId}/${filename} mode=${mode}`);

                if (mode === 'url') {
                    const result = await pbRetry(this, msg, async (pb) => {
                        return pb.files.getUrl({ collectionName: collection, id: recordId }, filename);
                    });
                    
                    msg.payload = result;
                    this.send(msg);
                } else {
                    const result = await pbRetry(this, msg, async (pb) => {
                        const response = await fetch(pb.files.getUrl({ collectionName: collection, id: recordId }, filename));
                        if (!response.ok) {
                            throw new Error(`Download failed: ${response.status} ${response.statusText}`);
                        }
                        return await response.arrayBuffer();
                    });

                    if (mode === 'buffer') {
                        msg.payload = Buffer.from(result);
                    } else if (mode === 'base64') {
                        msg.payload = Buffer.from(result).toString('base64');
                    }
                    
                    this.send(msg);
                }

            } catch (error) {
                this.error(`PB Download failed: ${error}`, msg);
            }
        });
    }
    
    RED.nodes.registerType("pb-download", PBDownloadNode);
};