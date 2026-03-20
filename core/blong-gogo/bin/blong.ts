#!/usr/bin/env -S node

import minimist from 'minimist';
import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import load from '../src/load.ts';

const argv: {_: string[]} = minimist(process.argv.slice(2));
const cwd = process.cwd();
const target = argv._[0];

if (target) {
    // Explicit file provided — load it directly
    (await import(resolve(target))).default(load);
} else {
    const indexFile = join(cwd, 'index.ts');
    const serverFile = join(cwd, 'server.ts');
    const browserFile = join(cwd, 'browser.ts');
    const name = basename(cwd);

    if (existsSync(indexFile)) {
        // index.ts exists — use it directly (suite or realm with a custom runner)
        (await import(indexFile)).default(load);
    } else if (existsSync(serverFile) && existsSync(browserFile)) {
        // Both server.ts and browser.ts — two-platform (suite or realm with browser)
        const {default: serverDef} = await import(serverFile);
        const {default: browserDef} = await import(browserFile);
        const platforms: Awaited<ReturnType<typeof load>>[] = await Promise.all([
            load(serverDef, name, name, ['microservice', 'integration', 'dev']),
            load(browserDef, name, name, ['microservice', 'integration', 'dev']),
        ]);
        for (const platform of platforms) await platform.start();
        await platforms[1].test();
        if (process.env.CI) for (const platform of platforms) await platform.stop();
    } else if (existsSync(serverFile)) {
        // Only server.ts — suite or realm (loadRealm detects and wraps realms automatically)
        const {default: serverDef} = await import(serverFile);
        const platform = await load(serverDef, name, name, ['microservice', 'integration', 'dev']);
        await platform.start();
        await platform.test();
        if (process.env.CI) await platform.stop();
    } else {
        throw new Error(
            `No index.ts or server.ts found in ${cwd}. ` +
                'Run blong from a suite or realm folder, or provide a file path.',
        );
    }
}
