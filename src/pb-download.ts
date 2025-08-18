import { NodeAPI, Node, NodeDef } from 'node-red';
import { isString, pbRetry, pbPropError } from './common';

export interface PBDownloadNodeDef extends NodeDef {
    name: string;
    collection: string;
    recordId: string;
    filename: string;
    fields: string;
    host: string;
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
                const fieldsValue = def.fields || msg.fields || '';
                const host = def.host || msg.host || '';
                const mode = def.mode || msg.mode || 'buffer';

                const fields: string[] = (
                    Array.isArray(fieldsValue) ? fieldsValue :
                    isString(fieldsValue) ? fieldsValue.split(',') :
                    []
                ).map((f: string) => f.trim()).filter((f: string) => f);

                if (!isString(collection)) throw pbPropError('Collection');
                if (!fields.length) {
                    if (!recordId) throw pbPropError('Fields Or Record ID');
                    if (!filename) throw pbPropError('Fields Or Filename');
                }
                if (!['buffer', 'base64', 'url'].includes(mode)) throw pbPropError('Mode (buffer|base64|url)');

                let newHost = host ? String(host).trim() : '';
                if (newHost) {
                    if (!newHost.startsWith('http')) newHost = `https://${newHost}`;
                    if (newHost.endsWith('/')) newHost = newHost.substring(0, newHost.length - 1);
                }

                const convertFile = (filename: string) => pbRetry(this, msg, async (pb) => {
                    const result: any = { filename };
                    let url = pb.files.getUrl({ collectionName: collection, id: recordId }, filename);
                    
                    if (newHost) {
                        url = url.replace(/https?:\/\/[^\/]+/, '');
                        if (url[0] !== '/') url = '/' + url;
                        url = newHost + url;
                    }
                    
                    result.url = url;
                    if (mode === 'buffer' || mode === 'base64') {
                        const response = await fetch(url);
                        if (!response.ok) throw new Error(`Download failed id:${recordId} filename:${filename}: ${response.status} ${response.statusText}`);
                        const arrayBuffer = await response.arrayBuffer();
                        result.contentType = response.headers.get('content-type') || 'application/octet-stream';
                        if (mode === 'buffer') {
                            result.buffer = Buffer.from(arrayBuffer);
                        }
                        if (mode === 'base64') {
                            const base64 = Buffer.from(arrayBuffer).toString('base64');
                            result.base64 = `data:${result.contentType};base64,${base64}`;
                        }
                    }
                    return result;
                });

                if (fields.length > 0) {
                    this.debug(`PB Download: ${collection}/${recordId} fields=[${fields.join(',')}] mode=${mode}`);

                    const convertFields = async (record: any) => {
                        for (const field of fields) {
                            if (!record[field]) continue;
                            const fieldValue = record[field];
                            if (Array.isArray(fieldValue)) {
                                const files: any[] = [];
                                for (const filename of fieldValue) {
                                    files.push(await convertFile(filename));
                                }
                                record[field] = files;
                            } else {
                                record[field] = await convertFile(fieldValue);
                            }
                        }
                    }

                    const payload = msg.payload;

                    if (Array.isArray(payload)) {
                        for (const record of payload) {
                            await convertFields(record);
                        }
                    } else {
                        await convertFields(payload);
                    }

                    this.send(msg);
                    return;
                }

                msg.payload = await convertFile(filename);
                this.send(msg);
            } catch (error) {
                this.error(`PB Download failed: ${error}`, msg);
            }
        });
    }
    
    RED.nodes.registerType("pb-download", PBDownloadNode);
};