#!/usr/bin/env -S node

import minimist from 'minimist';
import {autoRun} from '../src/loadServer.ts';

const argv: {_: string[]} = minimist(process.argv.slice(2));

await autoRun({cwd: process.cwd(), target: argv._[0]});
