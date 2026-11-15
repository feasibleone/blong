#!/usr/bin/env -S node --watch --conditions=development --inspect

import minimist from 'minimist';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {printUsage, shouldShowHelp} from '../src/cliHelp.ts';
import {resolveTarget} from '../src/cliTarget.ts';
import {autoRun} from '../src/runServer.ts';

const argv: {_: string[]} = minimist(process.argv.slice(2));

// `--help` / `-h` — short-circuit before autoRun so usage works from any directory.
if (shouldShowHelp(argv as Record<string, unknown>)) {
    printUsage(() => process.exit(0));
}

// The first positional may name a file or folder to run — spelled as one (`./server.ts`, `dev/`) — and
// the rest are intents. A bare word is an intent whatever the filesystem holds (`@@D-858`).
const {target, intents} = resolveTarget(argv._, p => existsSync(resolve(p)));

await autoRun({cwd: process.cwd(), target: target && resolve(target), intents});
