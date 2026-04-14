import {type SolutionFactory} from '@feasibleone/blong/types';
import {existsSync} from 'node:fs';
import {basename, resolve} from 'node:path';
import {analyzeFolder, synthesizeServerFromHandlers} from './folderAnalysis.ts';
import load from './loadServer.ts';

/**
 * Runs the standard platform lifecycle: start → test → (CI) stop.
 */
export async function runPlatform(serverDef: SolutionFactory, name: string): Promise<void> {
    const platform = await load(serverDef as Parameters<typeof load>[0], name, name, [
        'microservice',
        'integration',
        'dev',
    ]);
    await platform.start();
    await platform.test();
    if (process.env.CI) await platform.stop();
}

/**
 * Auto-detects and runs the appropriate platform from the given working directory.
 *
 * Resolution order:
 *   1. Explicit `target` path (loaded directly).
 *   2. `index.ts` — suite / realm with a custom runner.
 *   3. `server.ts` + `browser.ts` — two-platform suite.
 *   4. `server.ts` alone — server-only suite or realm.
 *   5. Folder contains handler files — synthesize a server suite on the fly.
 *   6. Throws if nothing matched.
 */
export async function autoRun(options: {cwd: string; target?: string}): Promise<void> {
    const {cwd, target} = options;

    if (target) {
        (await import(target)).default(load);
        return;
    }

    const name = basename(cwd);
    const indexFile = resolve(cwd, 'index.ts');
    const serverFile = resolve(cwd, 'server.ts');
    const browserFile = resolve(cwd, 'browser.ts');

    if (existsSync(indexFile)) {
        (await import(indexFile)).default(load);
    } else if (existsSync(serverFile) && existsSync(browserFile)) {
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
        const {default: serverDef} = await import(serverFile);
        await runPlatform(serverDef, name);
    } else {
        const analysis = await analyzeFolder(cwd);
        if (analysis.kind === 'handlers' || analysis.kind === 'mixed') {
            await runPlatform(await synthesizeServerFromHandlers(cwd, analysis), name);
        } else {
            throw new Error(
                `No entry point found in ${cwd}. ` +
                    'Run blong from a folder that contains a suite (server.ts / browser.ts / index.ts), ' +
                    'a realm (realm.ts), or handler files (e.g. helloHello.ts). ' +
                    'You can also provide a file path as an argument.',
            );
        }
    }
}
