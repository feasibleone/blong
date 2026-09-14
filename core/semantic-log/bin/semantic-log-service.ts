#!/usr/bin/env -S node
/**
 * Start the cluster service.
 *
 * Usage: semantic-log-service [--port <n>] [--host <addr>] [--persist <file>]
 *                             [--embedding offline|local|remote]
 *                             [--embedding-url <url>] [--embedding-model <name>]
 *
 * `--embedding` wins over `SEMANTIC_LOG_EMBEDDING`, so a shell that exports the variable
 * for a whole session can still start one service on the deterministic provider.
 */

import {createApp} from '../src/service/app.ts';
import {embeddingFromEnv} from '../src/service/provider.ts';

function arg(name: string, fallback?: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : fallback;
}

const port = Number(arg('port', '9455'));
const host = arg('host', '127.0.0.1') ?? '127.0.0.1';
const persistTo = arg('persist');
const requested = arg('embedding');

const app = createApp({
    logger: true,
    persistTo,
    embedding:
        requested === undefined
            ? embeddingFromEnv()
            : {
                  kind: requested as 'offline' | 'local' | 'remote',
                  url: arg('embedding-url'),
                  model: arg('embedding-model'),
              },
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
        void app.close().then(() => process.exit(0));
    });
}

await app.listen({port, host});
