#!/usr/bin/env -S node

import minimist from 'minimist';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {autoRun} from '../src/runServer.ts';

const argv: {_: string[]} = minimist(process.argv.slice(2));

// The first positional arg is an optional file/folder target; the rest are intents.
const [maybeTarget, ...rest] = argv._;
const target = maybeTarget && existsSync(resolve(maybeTarget)) ? maybeTarget : undefined;
const intents = target ? rest : argv._;

await autoRun({cwd: process.cwd(), target, intents});
