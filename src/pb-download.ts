import { NodeAPI, Node, NodeDef } from 'node-red';
import { isString, pbRetry, pbPropError } from './common';

export interface PBDownloadNodeDef extends NodeDef {
    name: string;
    collection: string;
    recordId: string;
    filename: string;
    fields: string;
    host: string;
    mode: 'buffer' | 'base64' | 'url' | 'url+type';
}

module.exports = (RED: NodeAPI) => {
    const PBDownloadNode = function(this: Node, def: PBDownloadNodeDef) {
        RED.nodes.createNode(this, def);

        this.on('input', async (msg: any) => {
            try {
                const record = msg.record || msg.payload;
                const collection = def.collection || msg.collection || record.collectionName;
                const id = def.recordId || msg.recordId || record.id;
                const filename = def.filename || msg.filename || record.file;
                const fieldsValue = def.fields || msg.fields || '';
                const host = def.host || msg.host || '';
                const mode = def.mode || msg.mode || 'buffer';

                msg.collection = collection;
                msg.recordId = id;

                const fields: string[] = (
                    Array.isArray(fieldsValue) ? fieldsValue :
                    isString(fieldsValue) ? fieldsValue.split(',') :
                    []
                ).map((f: string) => f.trim()).filter((f: string) => f);

                if (!isString(collection)) throw pbPropError('Collection');
                if (!fields.length) {
                    if (!id) throw pbPropError('Fields Or Record ID');
                    if (!filename) throw pbPropError('Fields Or Filename');
                }
                if (!['buffer', 'base64', 'url', 'url+type'].includes(mode)) throw pbPropError('Mode (buffer|base64|url|url+type)');

                let newHost = host ? String(host).trim() : '';
                if (newHost) {
                    if (!newHost.startsWith('http')) newHost = `https://${newHost}`;
                    if (newHost.endsWith('/')) newHost = newHost.substring(0, newHost.length - 1);
                }

                const convertFile = (id: string, filename: string) => pbRetry(this, msg, async (pb) => {
                    const result: any = { filename };
                    let url = pb.files.getUrl({ collectionName: collection, id }, filename);
                    
                    if (newHost) {
                        result.localUrl = url;
                        const pathPart = url.replace(/https?:\/\/[^\/]+/, '');
                        url = pathPart.startsWith('/') ? newHost + pathPart : newHost + '/' + pathPart;
                    }
                    
                    result.url = url;
                    if (mode === 'buffer' || mode === 'base64' || mode === 'url+type') {
                        const response = await fetch(url, { method: mode === 'url+type' ? 'HEAD' : 'GET' });
                        if (!response.ok) throw new Error(`Download failed id:${id} filename:${filename}: ${response.status} ${response.statusText}`);
                        result.type = response.headers.get('content-type') || 'application/octet-stream';
                        
                        if (mode === 'buffer') {
                            const arrayBuffer = await response.arrayBuffer();
                            result.buffer = Buffer.from(arrayBuffer);
                        } else if (mode === 'base64') {
                            const arrayBuffer = await response.arrayBuffer();
                            const base64 = Buffer.from(arrayBuffer).toString('base64');
                            result.base64 = `data:${result.type};base64,${base64}`;
                        }
                        // mode === 'url+type' : just keep url and type, no download
                    }
                    return result;
                });

                if (fields.length > 0) {
                    this.debug(`PB Download: ${collection}/${id} fields=[${fields.join(',')}] mode=${mode}`);

                    const convertFields = async (record: any) => {
                        for (const field of fields) {
                            if (!record[field]) continue;
                            const fieldValue = record[field];
                            if (Array.isArray(fieldValue)) {
                                const files: any[] = [];
                                for (const filename of fieldValue) {
                                    files.push(await convertFile(record.id, filename));
                                }
                                record[field] = files;
                            } else {
                                record[field] = await convertFile(record.id, fieldValue);
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

                msg.payload = await convertFile(id, filename);
                this.send(msg);
            } catch (error) {
                this.error(`PB Download failed: ${error}`, msg);
            }
        });
    }
    
    RED.nodes.registerType("pb-download", PBDownloadNode);
};