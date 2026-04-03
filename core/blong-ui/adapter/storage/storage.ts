import { library } from '@feasibleone/blong';

const TOKEN_KEY = 'blong.auth.token';
const PERMISSIONS_KEY = 'blong.auth.permissions';

// In-memory fallback for Node.js environments (tests, SSR)
const memStore = new Map<string, string>();

export default library(() => ({
    TOKEN_KEY,
    PERMISSIONS_KEY,
    storeGet(key: string): string | null {
        if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
        return memStore.get(key) ?? null;
    },
    storeSet(key: string, value: string): void {
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
        else memStore.set(key, value);
    },
    storeDelete(key: string): void {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
        else memStore.delete(key);
    },
}));
