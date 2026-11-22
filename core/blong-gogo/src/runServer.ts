import {
    type ILog,
    type SolutionFactory,
    type VocabularyProxy,
    kind,
} from '@feasibleone/blong/types';
import {signalView, writeThroughFace} from '@feasibleone/lukaot';
import {LOG_DESTINATION_CODE} from '@feasibleone/lukaot/node';
import {existsSync} from 'node:fs';
import {basename, dirname, resolve} from 'node:path';
import {analyzeFolder, synthesizeServerFromHandlers} from './folderAnalysis.ts';
import {frameworkSignalRegistry} from './frameworkSignals.ts';
import load from './loadServer.ts';

/** Default intents applied when none are provided on the CLI. */
export const DEFAULT_INTENTS = [
    'microservice',
    'integration',
    'dev',
    ...(process.env.CI ? ['ci'] : []),
] as const;

/** Whether this process already reports its runtime warnings, so a second platform does not double them. */
let reportingWarnings = false;

/**
 * Options for {@link gracefulShutdown}. Dependencies are injectable so the helper
 * can be unit-tested without touching the real process.
 */
export interface GracefulShutdownOptions {
    /**
     * The process's vocabulary, when the caller hands one over (optional).
     *
     * Named `vocabulary` rather than `signal` because the handler's own parameter *is* the signal —
     * `SIGTERM` — and the two would shadow each other. Not a logger: the two things this handler says
     * are declared signals, so what it needs is the vocabulary, and nothing that carries levels. A
     * caller with none passes nothing and the handler still writes its deterministic marker.
     */
    vocabulary?: VocabularyProxy;
    /** Exit function — defaults to `process.exit`. Injected in tests. */
    exit?: (code: number) => void;
    /** Raw output writer for the deterministic marker — defaults to `process.stderr.write`. */
    write?: (chunk: string) => void;
    /** How long to wait for `stop` before force-exiting. Defaults to 30s. */
    timeoutMs?: number;
    /**
     * How soon after a signal a second one is the *same* Ctrl+C arriving twice.
     *
     * A terminal delivers one SIGINT to every process in the foreground group, and a package manager
     * forwards the signal it received to the process it started — which is also in that group. So one
     * keystroke reaches blong twice, milliseconds apart, and the handler used to take the second for an
     * operator demanding a forced exit: the log read "shutting down" immediately followed by "second
     * SIGINT received, forcing exit", and the cleanup the handler exists for was cut off. Measured: a
     * parent that forwards what it receives gives its child two SIGINTs from one group signal
     * (@@D-958). A deliberate second press comes after the operator has waited, so the window is
     * what separates them; the bounded `timeoutMs` still covers a shutdown that really hangs.
     */
    repeatGraceMs?: number;
}

/**
 * Create a shutdown handler and its unsubscribe function without touching the
 * real process. Exported separately so unit tests can drive the handler with a
 * plain signal string instead of emitting real signals (which would collide with
 * the test runner's own signal handling).
 */
export function createShutdownHandler(
    stop: () => Promise<unknown>,
    {vocabulary, exit, write, timeoutMs, repeatGraceMs}: GracefulShutdownOptions = {},
): {handler: (signal: string) => void; unsubscribe: () => void} {
    const exitFn = exit ?? (code => process.exit(code));
    const writeFn = write ?? (s => process.stderr.write(s));
    const timeout = timeoutMs ?? 30_000;
    const grace = repeatGraceMs ?? 1000;

    let shuttingDown = false;
    let startedAt = 0;
    let timer: NodeJS.Timeout | undefined;
    const handler = (signal: string): void => {
        if (shuttingDown) {
            // The same keystroke echoed by whoever started this process, or an operator asking again:
            // only the second is worth cutting the cleanup short for (@@D-958).
            if (Date.now() - startedAt < grace) return;
            writeFn(`blong: second ${signal} received, forcing exit\n`);
            exitFn(1);
            return;
        }
        shuttingDown = true;
        startedAt = Date.now();
        writeFn(`blong: shutting down on ${signal}\n`);
        // The SIGTERM/SIGINT that started it stays on the record as a param: the sentence does
        // not interpolate it, and a reader looking at why a process stopped wants to know which.
        vocabulary?.frameworkShutdownStarting?.({signal});
        // Start the bounded-wait timer only once shutdown is triggered — a
        // graceful-shutdown timeout must bound the STOP, not the run. A timer
        // created at handler-creation time would self-destruct a long-running
        // dev server (e.g. `blong` / `blong-watch` backing the Playwright
        // webServer) after `timeoutMs`, even with no signal ever received.
        // These deterministic stderr markers are the triage signature for the
        // Playwright login flake: a blong-watch restart mid-login shows a 502 on
        // /rpc/login/.well-known/mle in the trace and this marker in the dev log.
        // See the blong-playwright skill → "Login Flake Triage".
        timer = setTimeout(() => {
            writeFn(`blong: graceful shutdown timed out after ${timeout}ms, forcing exit\n`);
            exitFn(1);
        }, timeout);
        timer.unref?.();
        stop()
            .then(() => {
                if (timer) clearTimeout(timer);
                exitFn(0);
            })
            .catch((error: unknown) => {
                writeFn(`blong: graceful shutdown failed: ${String(error)}\n`);
                vocabulary?.frameworkShutdownFailed?.({error});
                if (timer) clearTimeout(timer);
                exitFn(1);
            });
    };
    return {
        handler,
        unsubscribe: () => {
            process.removeListener('SIGTERM', handler);
            process.removeListener('SIGINT', handler);
            if (timer) clearTimeout(timer);
        },
    };
}

/**
 * Report the runtime's own warnings as the process's records (@@D-959).
 *
 * Node raises deprecations, listener leaks and a log destination that refused a batch as `warning`
 * events, which reach the terminal and nothing else: a served process's records — what the viewer, the
 * collector and an operator's query read — never carried them. The destination failure is the one that
 * matters most, because its own record is exactly what cannot be written: the batch it would travel in
 * is the batch that was refused (`@@F-811`).
 *
 * Two rules keep it safe. Node prints the warning to stderr **and** calls the listener, so writing a
 * record adds the structured copy rather than replacing the line a person sees — the diagnosis survives
 * even when the destination does not. And the reporter ignores warnings for the turn in which it wrote
 * one, because a sink that warns about its own record is how a reporter feeds itself: the shape of every
 * logging loop ever written. The log destination is that sink by definition, so the guard is what keeps
 * a broken destination from turning one warning into a stream of records that can never arrive
 * (@@F-811 @@D-958).
 *
 * Installed once per process: a suite loads two platforms that share one, and two reporters would write
 * every warning twice.
 *
 * @param log - The process's log component (`platform.logComponent`), whose `warn` line the record
 *   travels through.
 * @returns An unsubscribe function, so a `cli` run that stops explicitly also stops reporting.
 */
export function reportProcessWarnings(log?: ILog): () => void {
    if (reportingWarnings) return () => undefined;
    const face = log?.logger('warn', {name: 'blong', context: 'process'}) as
        | {warn?: (fields: object, message: string) => void}
        | undefined;
    if (!face?.warn) return () => undefined;
    reportingWarnings = true;
    const {vocabulary} = signalView(frameworkSignalRegistry(), writeThroughFace(face));
    // The reporter's own turn, held for the whole event-loop turn rather than for the call: a warning
    // is delivered on `process.nextTick`, so a sink that raises one *while* its record is written
    // (the log destination does exactly that when a batch cannot be sent, @@F-811) is heard after the
    // write has returned. A flag cleared in `finally` would be false by then and the turn would write
    // another record into the same sink, forever, never yielding to I/O. `setImmediate` runs after the
    // ticks of this turn, so it is when the reporter may listen again; the handle is unref'd because a
    // process on its way out must not be held open for it.
    let writing = false;
    const listener = (warning: Error & {code?: string}): void => {
        if (writing) return;
        writing = true;
        try {
            const params = {
                name: warning.name ?? 'Warning',
                code: warning.code ?? 'no-code',
                message: warning.message,
            };
            // Which identifier carries it is the warning's code, not its name: a lost batch is an error
            // (@@D-960), and `process.emitWarning` gives every event the same name unless the emitter
            // chose one, so the code is the only thing a reporter can trust.
            if (warning.code === LOG_DESTINATION_CODE) {
                vocabulary.frameworkLogDestinationFailed?.(params);
            } else {
                vocabulary.frameworkProcessWarning?.(params);
            }
        } catch {
            // The record could not be written, and Node has already printed the warning itself: the
            // diagnosis is on the terminal, so repeating it here buys nothing and a throw would land on
            // a tick nobody awaits as an uncaught exception.
        } finally {
            const release = setImmediate(() => {
                writing = false;
            });
            release.unref?.();
        }
    };
    process.on('warning', listener);
    return () => {
        reportingWarnings = false;
        process.removeListener('warning', listener);
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
    // A call nobody awaits is the *site's* to report, not the runtime's: every place that fires one
    // catches and logs it — the operator's watch and its controller loop are the two in this
    // repository — because a process-wide listener swallowed the rejection, named no call, and let the
    // failure repeat until something restarted the process for it (T-229). Nothing is installed here.
    const shutdown = gracefulShutdown(() => platform.stop!());
    // The runtime's own warnings join this process's records, beside the shutdown handler for the same
    // reason: both are installed once the log exists and stay until the process ends (@@D-959).
    reportProcessWarnings(platform.logComponent);
    await platform.test!(undefined);
    // Whether the process outlives its work is a config decision, declared per
    // intent (`cli`/`db` exit, `playwright` does not, `integration` only in CI) —
    // see the synthetic intent config in `load.ts`. No intent-name matching here.
    if (platform.exit) {
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

    if (target && existsSync(resolve(cwd, target))) {
        // Resolved against `cwd` before it is imported, the way it was just tested: a bare
        // `./index.ts` is specifier-relative, so `import` would look for it beside *this* module
        // rather than in the folder the CLI ran in, and fail with a path that names neither the file
        // the caller typed nor the reason (F-438).
        await runTarget(resolve(cwd, target), intents);
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
        // One reporter for the process, not one per platform: the two share it and would write the
        // same warning twice. The server half is the one whose log the record travels through
        // (@@D-959).
        reportProcessWarnings(platforms[0].logComponent);
        await platforms[1].test!(undefined);
        // Both platforms are loaded with the same intents, so either one carries
        // the same resolved flag.
        if (platforms[0].exit) {
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
