#!/usr/bin/env -S tsx watch --inspect --ignore **/test/**

import minimist from 'minimist';
import {resolve} from 'node:path';
import load from '../src/load.js';

const argv: {_: string[]} = minimist(process.argv.slice(2));

(await import(resolve(argv._[0] ?? 'index.ts'))).default(load);
