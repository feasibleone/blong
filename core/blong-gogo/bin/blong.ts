#!/usr/bin/env -S node

import minimist from 'minimist';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {printUsage, shouldShowHelp} from '../src/cliHelp.ts';
import {isTargetArgument, resolveTarget} from '../src/cliTarget.ts';
import {autoRun} from '../src/runServer.ts';

const rawArgv = minimist(process.argv.slice(2)) as {
    _: string[];
    object?: string;
    [key: string]: unknown;
};

// `--help` / `-h` — short-circuit before realm-create / autoRun so usage works
// from any directory (even one without a suite entry point).
if (shouldShowHelp(rawArgv)) {
    printUsage(() => process.exit(0));
}

const {_: positionals, object: objectName} = rawArgv;

// `blong realm <name>` (or `blong create realm <name>`) — scaffold a new realm.
// `create` is an optional (implied) intent; `realm` selects the creation path.
// The realm name is the positional following `realm`. This stays within the
// intent model — no separate subcommand — so the target-vs-intents parsing is
// untouched for every other invocation.
const isRealmCreate =
    positionals.includes('realm') &&
    // If one of the positionals is an existing path it is a target, not the
    // realm-creation intent. A *name* is never a path: `blong realm dev` scaffolds
    // `dev` even in a folder that holds one (`@@D-858`).
    !positionals.some(p => isTargetArgument(p) && existsSync(resolve(p)));
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

// `blong grant <capability> [--ttl=15m] [--key=<jwk|ENV_VAR>]` — mint a
// short-lived capability token (see `src/grant.ts`). Like `blong realm`, this
// stays within the intent model rather than becoming a subcommand tree: `grant`
// is only a command when it is the first positional and no positional names an
// existing path (a suite is never run by a `grant` argument in practice, and
// `existsSync` is the same guard the realm-create branch uses).
const isGrantCommand =
    positionals[0] === 'grant' &&
    !positionals.some(p => isTargetArgument(p) && existsSync(resolve(p)));
if (isGrantCommand) {
    const {runGrantCommand} = await import('../src/grant.ts');
    await runGrantCommand(positionals, rawArgv);
    process.exit(0);
}

const parsed = minimist(process.argv.slice(2)) as {_: string[]};
// The first positional may name a file or folder to run — spelled as one (`./server.ts`, `dev/`) — and
// the rest are intents. A bare word is an intent whatever the filesystem holds (`@@D-858`).
const {target, intents} = resolveTarget(parsed._, p => existsSync(resolve(p)));

await autoRun({cwd: process.cwd(), target, intents});
