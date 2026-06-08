import {type SolutionFactory, kind} from '@feasibleone/blong/types';
import {existsSync} from 'node:fs';
import {basename, dirname, resolve} from 'node:path';
import {analyzeFolder, synthesizeServerFromHandlers} from './folderAnalysis.ts';
import load from './loadServer.ts';

/** Default intents applied when none are provided on the CLI. */
export const DEFAULT_INTENTS = [
    'microservice',
    'integration',
    'dev',
    ...(process.env.CI ? ['ci'] : []),
] as const;

/**
 * Runs the standard platform lifecycle: start → test → (CI) stop.
 *
 * @param intents - Active intents that control which config blocks and layers are activated.
 *   Defaults to {@link DEFAULT_INTENTS} when omitted.
 */
export async function runPlatform(
    serverDef: SolutionFactory,
    name: string,
    intents: string[] = [...DEFAULT_INTENTS],
): Promise<void> {
    const platform = await load(
        serverDef as unknown as Parameters<typeof load>[0],
        name,
        name,
        intents,
    );
    await platform.start!({});
    await platform.test!(undefined);
    if (process.env.CI && !intents.includes('playwright')) await platform.stop!();
}

/**
 * Runs the appropriate target module based on its kind.
 *
 * @param target - Path to a module that exports a default solution factory or platform.
 * @param intents - Active intents that control which config blocks and layers are activated.
 *
 */
async function runTarget(target: string, intents: string[]): Promise<void> {
    const targetModule = await import(target);
    if (!targetModule.default) {
        throw new Error(`Target module ${target} has no default export`);
    }
    if (kind(targetModule.default) === 'server') {
        return await runPlatform(targetModule.default, basename(dirname(target)), intents);
    } else await targetModule.default(load);
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
 *
 * @param options.intents - Active intents from the CLI (positional args after the optional target
 *   path). When empty, {@link DEFAULT_INTENTS} are used so that a plain `blong` invocation works
 *   out of the box.
 */
export async function autoRun(options: {
    cwd: string;
    target?: string;
    intents?: string[];
}): Promise<void> {
    const {cwd, target, intents: cliIntents} = options;
    // Use CLI-supplied intents; fall back to defaults when the user passed none.
    const intents = cliIntents && cliIntents.length > 0 ? cliIntents : [...DEFAULT_INTENTS];

    if (target && existsSync(target)) {
        await runTarget(target, intents);
        return;
    }

    const name = basename(cwd);
    const indexFile = resolve(cwd, 'index.ts');
    const serverFile = resolve(cwd, 'server.ts');
    const browserFile = resolve(cwd, 'browser.ts');

    if (existsSync(indexFile)) {
        await runTarget(indexFile, intents);
    } else if (existsSync(serverFile) && existsSync(browserFile)) {
        const {default: serverDef} = await import(serverFile);
        const {default: browserDef} = await import(browserFile);
        const platforms: Awaited<ReturnType<typeof load>>[] = await Promise.all([
            load(serverDef, name, name, intents),
            load(browserDef, name, name, intents),
        ]);
        for (const platform of platforms) await platform.start({});
        await platforms[1].test!(undefined);
        if (process.env.CI && !intents.includes('playwright'))
            for (const platform of platforms) await platform.stop();
    } else if (existsSync(serverFile)) {
        const {default: serverDef} = await import(serverFile);
        await runPlatform(serverDef, name, intents);
    } else {
        const analysis = await analyzeFolder(cwd);
        if (analysis.kind === 'handlers' || analysis.kind === 'mixed') {
            await runPlatform(await synthesizeServerFromHandlers(cwd, analysis), name, intents);
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
