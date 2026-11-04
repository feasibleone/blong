/**
 * `@feasibleone/blong-asset` — the server a deployed suite's browser bundle is published by.
 *
 * The bundle is a directory of files a build produced, so serving it is not part of a business
 * realm's work: a realm process carries the API, and this one carries `/s/` and nothing else. That
 * separation is what keeps the asset surface free of the API's dependencies, and it is why the
 * deployment can run it from the same image with a much smaller command line.
 *
 * Two ways in, for the two processes that need one: {@link createAssetServer} builds a server of its
 * own (the `blong-asset` CLI and a generated Deployment), while {@link assetPlugin} attaches the same
 * routes to a server a caller already has — which is the door `blong-gogo`'s development serve would
 * use if the built-in one ever needed replacing. Nothing here imports the framework, so the package
 * is as deployable on its own as it is inside the image.
 */
export {
    assetPlugin,
    createAssetServer,
    startAssetServer,
    type IAssetServerHandle,
    type IAssetServerOptions,
} from './src/assetPlugin.ts';
export {
    cacheControlFor,
    DEFAULT_CACHE_POLICY,
    defaultCachePolicy,
    type ICachePolicy,
} from './src/cache.ts';
export {readConfigFile, type IAssetServerConfigFile} from './src/config.ts';
export {
    collectInlineHashes,
    securityHeaders,
    type ICspOptions,
    type IHeaderOptions,
    type IHstsOptions,
} from './src/headers.ts';
export {
    normalizeBase,
    resolveRelativePath,
    toFileSystemPath,
    type IResolvedTarget,
} from './src/paths.ts';
