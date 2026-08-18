#!/usr/bin/env -S node

import minimist from 'minimist';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {autoRun} from '../src/runServer.ts';

const rawArgv = minimist(process.argv.slice(2)) as {
    _: string[];
    object?: string;
    [key: string]: unknown;
};
const {_: positionals, object: objectName} = rawArgv;

// `blong realm <name>` (or `blong create realm <name>`) — scaffold a new realm.
// `create` is an optional (implied) intent; `realm` selects the creation path.
// The realm name is the positional following `realm`. This stays within the
// intent model — no separate subcommand — so the target-vs-intents parsing is
// untouched for every other invocation.
const isRealmCreate =
    positionals.includes('realm') &&
    // If one of the positionals is an existing path it is a target, not the
    // realm-creation intent.
    !positionals.some(p => existsSync(resolve(p)));
if (isRealmCreate) {
    const realmIdx = positionals.indexOf('realm');
    const realmName = positionals[realmIdx + 1];
    if (!realmName || realmName === 'create' || realmName === 'realm') {
        throw new Error(
            'Usage: blong realm <name> [--object <entity>]   (or: blong create realm <name>)',
        );
    }
    const {createRealm} = await import('../src/kopi.ts');
    await createRealm(resolve(process.cwd(), realmName), undefined, {object: objectName});
    // Strip the reserved words (and the consumed `--object` flag) so they never
    // leak into config intents, then run the freshly scaffolded realm — autoRun
    // finds its `index.ts` in the new folder.
    const cleaned = positionals.filter(p => p !== 'realm' && p !== 'create' && p !== realmName);
    const namedFlags = Object.entries(rawArgv)
        .filter(([key]) => key !== '_' && key !== 'object')
        .flatMap(([key, value]) => {
            if (Array.isArray(value)) return value.map(v => `--${key}=${v}`);
            if (value === true) return [`--${key}`];
            return [`--${key}=${value}`];
        });
    process.argv = [process.argv[0], process.argv[1], ...cleaned, ...namedFlags];
    process.chdir(resolve(process.cwd(), realmName));
}

const parsed = minimist(process.argv.slice(2)) as {_: string[]};
// The first positional arg is an optional file/folder target; the rest are intents.
const [maybeTarget, ...rest] = parsed._;
const target = maybeTarget && existsSync(resolve(maybeTarget)) ? maybeTarget : undefined;
const intents = target ? rest : parsed._;

await autoRun({cwd: process.cwd(), target, intents});
