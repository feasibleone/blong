#!/usr/bin/env node

/**
 * CLI entry point for the blong-log server.
 *
 * Usage:
 *   npx blong-log [options]
 *
 * Options:
 *   --udp-port <port>    UDP port to listen on (default: 9999)
 *   --http-port <port>   HTTP port for REST/WebSocket (default: 9998)
 *   --host <host>        Host to bind to (default: 127.0.0.1)
 *   --buffer-size <n>    Max entries in buffer (default: 10000)
 *   --recent-count <n>   Entries to send on connect (default: 200)
 *   --trace-url <url>    URL pattern for trace view
 *   --theme <dark|light> UI theme (default: dark)
 */

import {LogServer} from './server.js';
import type {LogServerOptions} from './types.js';

const args = process.argv.slice(2);

function getArg(name: string, defaultValue?: string): string | undefined {
    const index = args.indexOf(`--${name}`);
    if (index >= 0 && index + 1 < args.length) {
        return args[index + 1];
    }
    return defaultValue;
}

const options: LogServerOptions = {
    udpPort: parseInt(getArg('udp-port', '9999')!, 10),
    httpPort: parseInt(getArg('http-port', '9998')!, 10),
    host: getArg('host', '127.0.0.1'),
    bufferSize: parseInt(getArg('buffer-size', '10000')!, 10),
    recentCount: parseInt(getArg('recent-count', '200')!, 10),
    traceUrlPattern: getArg('trace-url', ''),
    theme: {
        mode: getArg('theme', 'dark') as 'dark' | 'light',
    },
};

const server = new LogServer(options);

const {httpPort, udpPort} = await server.start();

console.log(`🔍 Blong Log Viewer`);
console.log(`   UI:        http://${options.host}:${httpPort}`);
console.log(`   UDP:       ${options.host}:${udpPort}`);
console.log(`   WebSocket: ws://${options.host}:${httpPort}/ws`);
console.log(`   Buffer:    ${options.bufferSize} entries`);
console.log();
console.log(`Add to your Pino configuration:`);
console.log(
    `   transport: {target: '@feasibleone/blong-log/transport', options: {port: ${udpPort}}}`,
);

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await server.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
});
