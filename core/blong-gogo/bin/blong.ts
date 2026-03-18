#!/usr/bin/env -S node

import minimist from 'minimist';
import {resolve} from 'node:path';
import load from '../src/load.ts';

const argv: {_: string[]} = minimist(process.argv.slice(2));

(await import(resolve(argv._[0] ?? 'index.ts'))).default(load);
