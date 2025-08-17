import { Node } from 'node-red';
import PocketBase, { ClientResponseError } from 'pocketbase';

export interface PBAuth {
    url: string;
    authCollection: string;
    username: string;
    password: string;
    token: string;
    tokenRefreshSeconds: number;
    autoRefreshOnError: boolean;
    lastRefresh?: number;
}

export const isArray = (v: any): v is any[] => Array.isArray(v);
export const isObject = <T extends {}>(v: unknown): v is T => typeof v === "object" && v !== null;
export const isString = (v: any): v is string => typeof v === 'string';
export const isNumber = (v: any): v is number => typeof v === 'number';
export const isBool = (v: any): v is boolean => v === true || v === false;

export const isPBAuth = (v: any): v is PBAuth => (
    isObject<PBAuth>(v) &&
    isString(v.token) &&
    isString(v.url) &&
    isString(v.authCollection) &&
    isString(v.username) &&
    isString(v.password) &&
    isNumber(v.tokenRefreshSeconds) &&
    isBool(v.autoRefreshOnError)
);

export const isPBAuthEquals = (a: PBAuth, b: PBAuth): boolean => (
    a && b &&
    a.url === b.url &&
    a.authCollection === b.authCollection &&
    a.username === b.username &&
    a.password === b.password &&
    a.tokenRefreshSeconds === b.tokenRefreshSeconds &&
    a.autoRefreshOnError === b.autoRefreshOnError
);

export const pbAuthInfo = (node: Node, msgAuth: Partial<PBAuth> = {}): PBAuth => {
    if (isPBAuth(msgAuth)) {
        return msgAuth as PBAuth;
    }

    const ctx = node.context();
    const flowAuth = ctx.flow.get('pbAuth') as PBAuth|undefined;
    if (isPBAuth(flowAuth) && isPBAuthEquals(flowAuth as PBAuth, msgAuth as PBAuth)) {
        return flowAuth as PBAuth;
    }

    const env = process.env;
    const url = msgAuth.url || env.PB_URL || '';
    const authCollection = msgAuth.authCollection || env.PB_AUTH_COLLECTION || '_superusers';
    const username = msgAuth.username || env.PB_USERNAME || 'admin';
    const password = msgAuth.password || env.PB_PASSWORD || '';
    const token = '';
    const tokenRefreshSeconds = msgAuth.tokenRefreshSeconds ?? 3600; // 1h par défaut
    const autoRefreshOnError = msgAuth.autoRefreshOnError ?? false;

    const newAuth: PBAuth = { url, authCollection, username, password, token, tokenRefreshSeconds, autoRefreshOnError };
    ctx.flow.set('pbAuth', newAuth);

    return newAuth;
}

export const propError = (name: string) => {
    const msg = `The property "${name}" is invalid`;
    return new Error(msg);
}

export const pbAuth = async (node: Node, auth: PBAuth): Promise<{ pb: PocketBase, auth: PBAuth }> => {
    const { url, authCollection, username, password, tokenRefreshSeconds, autoRefreshOnError } = auth;
    let { token, lastRefresh } = auth;

    if (!isString(url)) throw propError('PB Url');
    if (!isString(authCollection)) throw propError('PB Auth Collection');
    if (!isString(username)) throw propError('PB Username');
    if (!isString(password)) throw propError('PB Password');

    const ctx = node.context();
    const pb = new PocketBase(url);
    const now = Date.now();

    if (token) {
        pb.authStore.save(token);
        
        // Vérifier si un refresh est nécessaire
        const shouldRefresh = tokenRefreshSeconds > 0 && 
            lastRefresh && 
            (now - lastRefresh) > (tokenRefreshSeconds * 1000);
            
        if (shouldRefresh) {
            try {
                const authData = await pb.collection(authCollection).authRefresh();
                token = authData.token;
                lastRefresh = now;
                node.debug(`PB token refreshed`);
            } catch (error) {
                node.debug(`PB token refresh failed: ${error}`);
                if (autoRefreshOnError) {
                    node.debug(`Auto refresh enabled, will re-authenticate`);
                    token = '';
                } else {
                    throw error;
                }
            }
        }
    }

    if (!token) {
        node.debug(`PB connecting... "${username}"`);
        try {
            const authData = await pb.collection(authCollection).authWithPassword(username, password);
            token = authData.token;
            lastRefresh = now;
            if (!isString(token)) throw new Error('no token ???');
            node.debug(`PB connected`);
        } catch (error) {
            const infoMsg = JSON.stringify({
                url,
                authCollection,
                username,
                passwordLength: password.length,
            });
            let errorMsg = String(error);
            if (error instanceof ClientResponseError) {
                const errorJson = JSON.stringify({ ...error.toJSON(), originalError: undefined });
                node.error(`PB Auth failed : ${error.response?.message}\n${error.status} ${error.url}\n${infoMsg}\n${errorJson}`);                
            }
            else {
                node.error(`PB Auth failed : ${errorMsg}\n${infoMsg}`);
            }
            throw error;
        }
    }

    const newAuth = { ...auth, token, lastRefresh };
    ctx.flow.set('pbAuth', newAuth);

    return { pb, auth: newAuth };
}

/** Check if error is authentication-related */
export const isAuthError = (error: any): boolean => {
    if (error instanceof ClientResponseError) {
        return error.status === 401 || error.status === 403;
    }
    return false;
}

/** Execute PocketBase operation with automatic re-auth on token error */
export const pbWithRetry = async <T>(
    node: Node, 
    msg: any, 
    operation: (pb: PocketBase) => Promise<T>
): Promise<T> => {
    let pb = await pbAutoAuth(node, msg);
    
    try {
        return await operation(pb);
    } catch (error) {
        if (isAuthError(error)) {
            node.debug(`Auth error detected, retrying with fresh auth: ${error}`);
            // Force new authentication by clearing cached pb
            delete msg.pb;
            msg.pbAuth = { ...msg.pbAuth, token: '' };
            pb = await pbAutoAuth(node, msg);
            return await operation(pb);
        } else {
            node.error(`PB ${error} : \n${JSON.stringify(error)}`)
        }
        throw error;
    }
}

/** Get authenticated PocketBase client from msg or auto-authenticate */
export const pbAutoAuth = async (node: Node, msg: any): Promise<PocketBase> => {
    if (msg.pb instanceof PocketBase) {
        return msg.pb;
    }
    const { auth, pb } = await pbAuth(node, pbAuthInfo(node, msg.pbAuth));
    msg.pbAuth = auth;
    msg.pb = pb;
    return pb;
}

