import { NodeAPI, Node, NodeDef } from 'node-red';
import { pbAuth, pbAuthInfo, pbAutoAuth, propError } from './common';

export interface PBRealtimeNodeDef extends NodeDef {
    name: string;
    collection: string;
    action: string;
}

module.exports = (RED: NodeAPI) => {
    const PBRealtimeNode = function(this: Node, def: PBRealtimeNodeDef) {
        let unsubscribe: (() => void) | null = null;

        RED.nodes.createNode(this, def);
        
        this.on('input', async (msg: any) => {
            try {
                const pb = await pbAutoAuth(this, msg);
                
                const collection = def.collection || msg.collection;
                const action = def.action || msg.action || 'subscribe';

                if (!collection) throw propError('Collection');
                
                if (action === 'subscribe') {
                    if (unsubscribe) {
                        console.debug('PB Realtime: Unsubscribing previous subscription');
                        unsubscribe();
                        unsubscribe = null;
                    }
                    
                    console.debug('PB Realtime: Subscribing to collection', collection);
                    
                    unsubscribe = await pb.collection(collection).subscribe('*', (event: any) => {
                        console.debug('PB Realtime: Event received', event.action, collection);
                        
                        const realtimeMsg = {
                            ...msg,
                            payload: {
                                action: event.action,
                                record: event.record,
                                collection: collection
                            },
                            pb: pb
                        };
                        
                        this.send(realtimeMsg);
                    });
                    
                    msg.payload = { 
                        status: 'subscribed', 
                        collection,
                        timestamp: new Date().toISOString()
                    };
                    msg.pb = pb;
                    this.send(msg);
                    
                } else if (action === 'unsubscribe') {
                    console.debug('PB Realtime: Unsubscribing from collection', collection);
                    
                    if (unsubscribe) {
                        unsubscribe();
                        unsubscribe = null;
                    }
                    
                    msg.payload = { 
                        status: 'unsubscribed', 
                        collection,
                        timestamp: new Date().toISOString()
                    };
                    this.send(msg);
                    
                } else {
                    this.error(`Unknown realtime action: ${action}`, msg);
                }
                
            } catch (error) {
                this.error(`PB Realtime ${def.action || 'operation'} failed: ${error}`, msg);
            }
        });
        
        this.on('close', () => {
            console.debug('PB Realtime: Node closing, cleaning up subscription');
            if (unsubscribe) {
                unsubscribe();
                unsubscribe = null;
            }
        });
    }
    
    RED.nodes.registerType("pb-realtime", PBRealtimeNode);
};