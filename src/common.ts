import { Node } from 'node-red';
import PocketBase, { ClientResponseError } from 'pocketbase';

export interface PBInfo {
    url: string;
    authCollection: string;
    username: string;
    password: string;
    tokenRefreshSeconds: number;
    autoRefreshOnError: boolean;
    lastRefresh: number;
    token?: string;
}

export const isObject = <T extends {}>(v: unknown): v is T => typeof v === "object" && v !== null;
export const isString = (v: any): v is string => typeof v === 'string';
export const isSafeNumber = (v: any): v is number => typeof v === 'number' && !Number.isNaN(v);
const isBool = (v: any): v is boolean => v === true || v === false;

export const pbData = (data: any): any => {
    if (!isObject(data)) throw pbPropError('data');
    
    const result: Record<string, any> = { ...data };
    
    for (const [k, v] of Object.entries(result)) {
        if (v && v.buffer && Buffer.isBuffer(v.buffer)) {
            const name = v.name || v.filename || `source`;
            const type = v.type || v.mimetype || 'application/octet-stream';
            result[k] = new File([new Uint8Array(v.buffer)], name, { type });
        } else if (Array.isArray(v)) {
            result[k] = v.map((item, index) => {
                if (item && item.buffer && Buffer.isBuffer(item.buffer)) {
                    const name = item.name || item.filename || `source_${index}`;
                    const type = item.type ||item.mimetype || 'application/octet-stream';
                    return new File([new Uint8Array(item.buffer)], name, { type });
                }
                return item;
            });
        }
    }
    
    return result;
};

export const pbPropError = (name: string) => {
    const msg = `The PB property "${name}" is invalid`;
    return new Error(msg);
}

export const getPBAuth = (pb: PocketBase): PBInfo => (pb as any)._auth;
const updatePBAuth = (pb: PocketBase, changes: Partial<PBInfo>) => {
    const info = { ...getPBAuth(pb), ...changes };
    info.lastRefresh = Date.now();
    (pb as any)._auth = info;
}

export const pbAuth = async (msg: any, info?: PBInfo): Promise<PocketBase> => {
    if (!msg) msg = {};
    const env = process.env || {};

    const i = info || (isObject(msg.pbInfo) ? msg.pbInfo : {});

    const url = i.url || env.PB_URL || '';
    if (!isString(url)) throw pbPropError('PB URL');

    let pb = msg.pb || new PocketBase(url);
    msg.pb = pb;

    if (isString(i.token) && i.token.trim()) {
        pb.authStore.save(i.token);
        pb = await pbRefresh(pb);
        return pb;
    }

    const authCollection = i.authCollection || env.PB_AUTH_COLLECTION || '_superusers';
    const username = i.username || env.PB_USERNAME || 'admin';
    const password = i.password || env.PB_PASSWORD || '';
    const tokenRefreshSeconds = i.tokenRefreshSeconds || 3600;
    const autoRefreshOnError = i.autoRefreshOnError || false;

    if (!isString(authCollection)) throw pbPropError('PB Auth Collection');
    if (!isString(username)) throw pbPropError('PB Username');
    if (!isString(password)) throw pbPropError('PB Password');
    if (!isSafeNumber(tokenRefreshSeconds)) throw pbPropError('PB tokenRefreshSeconds');
    if (!isBool(autoRefreshOnError)) throw pbPropError('PB autoRefreshOnError');

    updatePBAuth(pb, {
        url,
        authCollection,
        username,
        password,
        tokenRefreshSeconds,
        autoRefreshOnError,
    });

    try {
        const auth = await pb.collection(authCollection).authWithPassword(username, password);
        if (!isString(auth.token)) throw new Error('No PB token after auth ???');
        updatePBAuth(pb, { token: auth.token });
        return pb;
    } catch (error) {
        const infoMsg = JSON.stringify({ ...info, password: undefined });
        let errorMsg = String(error);
        if (error instanceof ClientResponseError) {
            const errorJson = JSON.stringify({
                ...error.toJSON(),
                originalError: undefined,
            });
            throw new Error(`PB Auth failed : ${error.response?.message}\n${error.status} ${error.url}\n${infoMsg}\n${errorJson}`);                
        }
        else {
            throw new Error(`PB Auth failed : ${errorMsg}\n${infoMsg}`);
        }
    }
}

const pbRefresh = async (pb: PocketBase) => {
    try {
        const info = getPBAuth(pb);
        const auth = await pb.collection(info.authCollection).authRefresh();
        updatePBAuth(pb, { token: auth.token });
        return pb;
    }
    catch (error) {
        const info = getPBAuth(pb);
        const newPb = await pbAuth({}, info);
        return newPb;
    }
}

export const pbClient = async (msg: any): Promise<PocketBase> => {
    if (!isObject(msg)) msg = {};
    if (isObject(msg.pb) && msg.pb instanceof PocketBase) return msg.pb;
    return await pbAuth(msg);
}

/** Execute PocketBase operation with automatic re-auth on token error */
export const pbRetry = async <T>(
    node: Node, 
    msg: any, 
    operation: (pb: PocketBase) => Promise<T>
): Promise<T> => {
    let pb = await pbClient(msg);

    const info = getPBAuth(pb);

    if (info.tokenRefreshSeconds) {
        const shouldRefresh = (Date.now() - info.lastRefresh) > (info.tokenRefreshSeconds * 1000);
        if (shouldRefresh) {
            try {
                pb = await pbRefresh(pb);
            }
            catch (error) {
                node.error(error);
                throw error;
            }
        }
    }
    
    try {
        return await operation(pb);
    } catch (error) {
        if (info.autoRefreshOnError) {
            node.warn(error);
            pb = await pbRefresh(pb);
            return await operation(pb);
        }
        node.error(error);
        throw error;
    }
}