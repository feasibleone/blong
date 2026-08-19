#!/usr/bin/env -S node --watch --conditions=development --inspect

import minimist from 'minimist';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {printUsage, shouldShowHelp} from '../src/cliHelp.ts';
import {autoRun} from '../src/runServer.ts';

const argv: {_: string[]} = minimist(process.argv.slice(2));

// `--help` / `-h` — short-circuit before autoRun so usage works from any directory.
if (shouldShowHelp(argv as Record<string, unknown>)) {
    printUsage(() => process.exit(0));
}

// The first positional arg is an optional file/folder target; the rest are intents.
const [maybeTarget, ...rest] = argv._;
const target = maybeTarget && existsSync(resolve(maybeTarget)) ? resolve(maybeTarget) : undefined;
const intents = target ? rest : argv._;

await autoRun({cwd: process.cwd(), target, intents});
