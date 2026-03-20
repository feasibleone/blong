#!/usr/bin/env -S node --watch --inspect

import minimist from 'minimist';
import {existsSync} from 'node:fs';
import {basename, resolve} from 'node:path';
import load from '../src/load.ts';

const argv: {_: string[]} = minimist(process.argv.slice(2));
const cwd = process.cwd();
const target = argv._[0];

if (target) {
    // Explicit file provided — load it directly (existing behavior)
    (await import(resolve(target))).default(load);
} else {
    // Auto-detect what to run based on available files in the current directory.
    const indexFile = resolve(cwd, 'index.ts');
    const serverFile = resolve(cwd, 'server.ts');
    const browserFile = resolve(cwd, 'browser.ts');

    if (existsSync(indexFile)) {
        (await import(indexFile)).default(load);
    } else if (existsSync(serverFile) && existsSync(browserFile)) {
        const {default: server} = await import(serverFile);
        const {default: browser} = await import(browserFile);
        const name = basename(cwd);
        const platforms: Awaited<ReturnType<typeof load>>[] = await Promise.all([
            load(server, name, name, ['microservice', 'integration', 'dev']),
            load(browser, name, name, ['microservice', 'integration', 'dev']),
        ]);
        for (const platform of platforms) await platform.start();
        await platforms[1].test();
        if (process.env.CI) for (const platform of platforms) await platform.stop();
    } else if (existsSync(serverFile)) {
        const {default: server} = await import(serverFile);
        const name = basename(cwd);
        const platform = await load(server, name, name, ['microservice', 'integration', 'dev']);
        await platform.start();
        await platform.test();
        if (process.env.CI) await platform.stop();
    } else {
        throw new Error(
            `No index.ts, server.ts, or browser.ts found in ${cwd}. ` +
                'Run blong from a suite or realm folder, or provide a file path.',
        );
    }
}
