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
 * Options for {@link gracefulShutdown}. Dependencies are injectable so the helper
 * can be unit-tested without touching the real process.
 */
export interface GracefulShutdownOptions {
    /** Logger for a final structured "shutting down" line (optional). */
    log?: {info?: (...args: unknown[]) => void; error?: (...args: unknown[]) => void};
    /** Exit function — defaults to `process.exit`. Injected in tests. */
    exit?: (code: number) => void;
    /** Raw output writer for the deterministic marker — defaults to `process.stderr.write`. */
    write?: (chunk: string) => void;
    /** How long to wait for `stop` before force-exiting. Defaults to 30s. */
    timeoutMs?: number;
}

/**
 * Create a shutdown handler and its unsubscribe function without touching the
 * real process. Exported separately so unit tests can drive the handler with a
 * plain signal string instead of emitting real signals (which would collide with
 * the test runner's own signal handling).
 */
export function createShutdownHandler(
    stop: () => Promise<unknown>,
    {log, exit, write, timeoutMs}: GracefulShutdownOptions = {},
): {handler: (signal: string) => void; unsubscribe: () => void} {
    const exitFn = exit ?? (code => process.exit(code));
    const writeFn = write ?? (s => process.stderr.write(s));
    const timeout = timeoutMs ?? 30_000;
    const timer = setTimeout(() => {
        writeFn(`blong: graceful shutdown timed out after ${timeout}ms, forcing exit\n`);
        exitFn(1);
    }, timeout);
    timer.unref?.();

    let shuttingDown = false;
    const handler = (signal: string): void => {
        if (shuttingDown) {
            writeFn(`blong: second ${signal} received, forcing exit\n`);
            exitFn(1);
            return;
        }
        shuttingDown = true;
        writeFn(`blong: shutting down on ${signal}\n`);
        log?.info?.({signal}, 'shutting down');
        stop()
            .then(() => {
                clearTimeout(timer);
                exitFn(0);
            })
            .catch((error: unknown) => {
                writeFn(`blong: graceful shutdown failed: ${String(error)}\n`);
                log?.error?.({error}, 'graceful shutdown failed');
                clearTimeout(timer);
                exitFn(1);
            });
    };
    return {
        handler,
        unsubscribe: () => {
            process.removeListener('SIGTERM', handler);
            process.removeListener('SIGINT', handler);
            clearTimeout(timer);
        },
    };
}

/**
 * Install SIGTERM/SIGINT handlers that gracefully stop the platform before exiting.
 *
 * This mirrors the approach of the `async-exit-hook` package but without adding a
 * dependency: run the async cleanup first, then exit. Rationale:
 *  - Kubernetes sends SIGTERM when terminating a pod — without a handler the process
 *    dies immediately and connections (knex pools, sockets, watchers) are orphaned.
 *  - GNU `timeout` also sends SIGTERM, so graceful handling covers that case too.
 *  - A second signal forces an immediate exit; a bounded wait (`timeoutMs`) means a
 *    stuck shutdown never hangs the process (so `timeout -k` is never required).
 *
 * The deterministic marker `blong: shutting down on <signal>` is written synchronously
 * to stderr so it is observable even when the logger is unavailable.
 *
 * @param stop - Async stop work, typically `() => platform.stop()`.
 * @returns An unsubscribe function (used by CI flows that stop explicitly).
 */
export function gracefulShutdown(
    stop: () => Promise<unknown>,
    options: GracefulShutdownOptions = {},
): () => void {
    const {handler, unsubscribe} = createShutdownHandler(stop, options);
    process.on('SIGTERM', handler);
    process.on('SIGINT', handler);
    return unsubscribe;
}

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
    const shutdown = gracefulShutdown(() => platform.stop!());
    await platform.test!(undefined);
    if (process.env.CI && !intents.includes('playwright')) {
        shutdown();
        await platform.stop!();
    }
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
        const manifest: Record<string, unknown> = {};
        const platforms: Awaited<ReturnType<typeof load>>[] = await Promise.all([
            load(serverDef, name, name, intents, manifest),
            load(browserDef, name, name, intents, manifest),
        ]);
        for (const platform of platforms) await platform.start({});
        const shutdown = gracefulShutdown(async () => {
            for (const platform of platforms) await platform.stop();
        });
        await platforms[1].test!(undefined);
        if (process.env.CI && !intents.includes('playwright')) {
            shutdown();
            for (const platform of platforms) await platform.stop();
        }
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
