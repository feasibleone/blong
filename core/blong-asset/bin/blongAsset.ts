#!/usr/bin/env node
/**
 * `blong-asset` — the process a deployment runs for a suite's browser bundle.
 *
 * The flags are the ones a generated Deployment names, and the environment falls back for the ones a
 * cluster provides (`PORT` from a Service, the root from a volume the fill wrote). A configuration
 * file carries everything else, because a Content-Security-Policy is a document rather than a flag.
 */
import {parseArgs} from 'node:util';
import {startAssetServer} from '../src/assetPlugin.ts';
import {readConfigFile} from '../src/config.ts';

const {values} = parseArgs({
    options: {
        root: {type: 'string'},
        base: {type: 'string'},
        host: {type: 'string'},
        port: {type: 'string'},
        config: {type: 'string'},
        'log-level': {type: 'string'},
        'no-root-redirect': {type: 'boolean'},
        'no-spa-fallback': {type: 'boolean'},
        'no-built-ins': {type: 'boolean'},
        help: {type: 'boolean', short: 'h'},
    },
    allowPositionals: false,
});

if (values.help) {
    process.stdout.write(
        [
            'blong-asset — serve a Blong suite browser bundle',
            '',
            'usage: blong-asset --root <dir> [--base /s/] [--config <file>]',
            '',
            '  --root <dir>       the build output to serve (BLONG_ASSET_ROOT)',
            '  --base <prefix>    the prefix it answers under (default /s/)',
            '  --host <host>      bind address (default 0.0.0.0)',
            '  --port <port>      port (default 8080, then PORT)',
            '  --config <file>    JSON headers/cache policy (BLONG_ASSET_CONFIG)',
            '  --log-level <lvl>  pino level (default warn)',
            '  --no-root-redirect the server does not answer / with a redirect',
            '  --no-spa-fallback  an unmatched path under the base is a 404',
            '  --no-built-ins     do not serve the package favicon or robots.txt',
            '',
        ].join('\n'),
    );
    process.exit(0);
}

const root = values.root ?? process.env.BLONG_ASSET_ROOT;
if (!root) {
    process.stderr.write('blong-asset: --root is required (or BLONG_ASSET_ROOT)\n');
    process.exit(2);
}

const config = readConfigFile(values.config ?? process.env.BLONG_ASSET_CONFIG);

const handle = await startAssetServer({
    root,
    base: values.base ?? config.base,
    headers: config.headers,
    cache: config.cache,
    builtIns: values['no-built-ins'] ? false : config.builtIns,
    redirectRoot: values['no-root-redirect'] ? false : config.redirectRoot,
    spaFallback: values['no-spa-fallback'] ? false : config.spaFallback,
    trustProxy: config.trustProxy,
    logger: {level: values['log-level'] ?? process.env.LOG_LEVEL ?? 'warn'},
    host: values.host,
    port: values.port ? Number(values.port) : Number(process.env.PORT ?? 8080),
});

process.stdout.write(`blong-asset serving ${root} at ${handle.url}\n`);

// A deploy stops a pod with SIGTERM, and a connection in flight is a page somebody is reading: the
// server drains rather than dropping what it was already answering.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
        void handle.close().then(() => process.exit(0));
    });
}
