import { NodeAPI, Node, NodeDef } from 'node-red';
import { pbAuth, pbAuthInfo, pbAutoAuth, propError } from './common';

export interface PBRealtimeNodeDef extends NodeDef {
    name: string;
    collection: string;
    action: string;
    topic: string;
    recordId: string;
}

module.exports = (RED: NodeAPI) => {
    const PBRealtimeNode = function(this: Node, def: PBRealtimeNodeDef) {
        const subscriptions: { [key: string]: () => void } = {};
        let connectionStatusSetup = false;

        RED.nodes.createNode(this, def);
        
        // Statut initial
        this.status({ fill: "grey", shape: "ring", text: "ready" });
        
        // Fonction pour configurer les événements de connexion
        const setupConnectionEvents = (pb: any) => {
            if (connectionStatusSetup) return;
            connectionStatusSetup = true;
            
            // Événement de connexion/reconnexion
            pb.realtime.subscribe('PB_CONNECT', () => {
                console.log('PB Realtime: Connected to server');
                this.status({ fill: "green", shape: "dot", text: "connected" });
            });
            
            // Événement de déconnexion
            pb.realtime.onDisconnect = (activeSubscriptions: any) => {
                console.log('PB Realtime: Disconnected from server, active subscriptions:', activeSubscriptions.length);
                this.status({ fill: "red", shape: "ring", text: "disconnected" });
            };
            
            // Statut initial
            if (pb.realtime.isConnected) {
                this.status({ fill: "green", shape: "dot", text: "connected" });
            } else {
                this.status({ fill: "yellow", shape: "ring", text: "connecting..." });
            }
        };
        
        this.on('input', async (msg: any) => {
            try {
                const pb = await pbAutoAuth(this, msg);
                
                const payload = msg.payload || {};
                const collection = def.collection || msg.collection;
                const action = def.action || msg.action || 'subscribe';
                const topic = def.topic || msg.topic || '*';
                
                // Détermine l'ID du record selon le topic
                let subscriptionTopic = '*';
                if (topic === 'recordId') {
                    const id = def.recordId || msg.recordId || payload.id;
                    if (!id) throw propError('Record ID (when topic is Record ID)');
                    subscriptionTopic = id;
                } else {
                    subscriptionTopic = topic;
                }

                if (!collection) throw propError('Collection');
                
                if (action === 'subscribe') {
                    // Configure les événements de connexion/déconnexion
                    setupConnectionEvents(pb);
                    
                    const subscriptionKey = `${collection}:${subscriptionTopic}`;
                    
                    // Vérifie si on a déjà cette subscription
                    if (subscriptions[subscriptionKey]) {
                        console.debug('PB Realtime: Subscription already exists for', subscriptionKey);
                        return;
                    }
                    
                    console.debug('PB Realtime: Subscribing to collection', collection, 'topic:', subscriptionTopic);
                    
                    try {
                        const unsubscribeFunc = await pb.collection(collection).subscribe(subscriptionTopic, (event: any) => {
                            console.debug('PB Realtime: Event received', event.action, collection, 'topic:', subscriptionTopic);
                            
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
                        
                        subscriptions[subscriptionKey] = unsubscribeFunc;
                        console.log('PB Realtime: Successfully subscribed to', subscriptionKey);
                        this.status({ fill: "green", shape: "dot", text: `${Object.keys(subscriptions).length} subscription(s)` });
                    } catch (subscribeError) {
                        console.error('PB Realtime: Subscription failed for collection', collection, 'topic:', subscriptionTopic, 'error:', subscribeError);
                        this.status({ fill: "red", shape: "dot", text: "subscription failed" });
                        throw subscribeError;
                    }
                    
                } else if (action === 'unsubscribe') {
                    const subscriptionKey = `${collection}:${subscriptionTopic}`;
                    
                    console.debug('PB Realtime: Unsubscribing from', subscriptionKey);
                    
                    const unsubscribeFunc = subscriptions[subscriptionKey];
                    if (unsubscribeFunc) {
                        unsubscribeFunc();
                        delete subscriptions[subscriptionKey];
                        console.log('PB Realtime: Successfully unsubscribed from', subscriptionKey);
                        
                        // Mise à jour du statut
                        if (Object.keys(subscriptions).length > 0) {
                            this.status({ fill: "green", shape: "dot", text: `${Object.keys(subscriptions).length} subscription(s)` });
                        } else {
                            this.status({ fill: "yellow", shape: "ring", text: "no subscriptions" });
                        }
                    } else {
                        console.debug('PB Realtime: No subscription found for', subscriptionKey);
                        this.status({ fill: "yellow", shape: "dot", text: "subscription not found" });
                    }
                    
                } else {
                    this.error(`Unknown realtime action: ${action}`, msg);
                }
                
            } catch (error) {
                console.error('PB Realtime: Operation failed:', error);
                this.status({ fill: "red", shape: "dot", text: "error" });
                this.error(`PB Realtime ${def.action || 'operation'} failed: ${error}`, msg);
            }
        });
        
        this.on('close', () => {
            console.debug('PB Realtime: Node closing, cleaning up all subscriptions');
            Object.keys(subscriptions).forEach((key) => {
                console.debug('PB Realtime: Cleaning up subscription', key);
                subscriptions[key]();
                delete subscriptions[key];
            });
            this.status({ fill: "grey", shape: "ring", text: "closed" });
        });
    }
    
    RED.nodes.registerType("pb-realtime", PBRealtimeNode);
};