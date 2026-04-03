// Browser-safe entry — used by bundlers via the "browser" exports condition.
// Server-only features (load, scan, Watch, RpcServer, Gateway, Log, adapter/server)
// must never appear here.
export {default as browserRealm} from './adapter/browser.ts';
