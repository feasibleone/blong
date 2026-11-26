import minimist from 'minimist';
import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

import load from './loadServer.ts';

/**
 * Shared plumbing for a realm CLI — the shell around the `cli` intent.
 *
 * A realm CLI is the same realm in another mode. `runCli` loads the suite with
 * the `cli` intent (no gateway, no RPC server, no watcher; every dispatch is
 * resolved in-process), resolves the method the arguments name against the
 * **live** registry, calls it, prints the result and stops. Going through the
 * runtime rather than calling the handlers directly is what makes the CLI and the
 * JSON-RPC surface agree — including the registry-backed answers an offline
 * process could only approximate.
 *
 * What it removes is a handful of things that are subtle, identical in every CLI
 * and wrong in interesting ways when re-derived: which channel the result goes
 * on, that `handles()` alone cannot tell whether a method exists, the
 * `load → start → dispatch → stop` order, and the exit-code conventions. Each of
 * those has been gotten wrong at least once.
 *
 * Typical use, as the whole content of a `bin/*.ts`:
 *
 * ```ts
 * import {isCliEntry, runCli} from '@feasibleone/blong-gogo/cli.ts';
 * import cliSuite from '../cli.ts';
 *
 * const options = {
 *     suite: cliSuite,
 *     name: 'my-realm',
 *     usage: USAGE,
 *     command: ({positionals}) =>
 *         positionals[0] ? {method: `myRealm.${positionals[0]}.find`} : undefined,
 * };
 *
 * if (isCliEntry(import.meta.url)) await runCli(options);
 * ```
 */

export interface Argv {
    [key: string]: unknown;
    _: (string | number)[];
}

export interface ParsedArgs {
    /** The minimist view: named flags plus the `_` positionals. */
    argv: Argv;
    /** `_` coerced to strings, so `source get PATH` reads naturally. */
    positionals: string[];
}

export interface CliCommand {
    /** Fully qualified method, e.g. `kukum.handler.add`. */
    method: string;
    /**
     * Handler params, passed through unchanged. Deliberately `object` rather
     * than `Record<string, unknown>`: an interface of optional params is not
     * assignable to an index signature, so every realm would have to cast.
     */
    params?: object;
}

/**
 * A verb that answers without the realm.
 *
 * Some commands are filesystem and `kubectl` work: scaffolding a tenant's rc
 * file, applying the two kustomizations it needs, encrypting a value with the
 * master key. Loading the suite for those would make a CLI that must run from
 * an empty folder (`npx @feasibleone/blong-kustomize provision`) depend on a
 * realm registry it never reads — and a `cli` run of a realm that expects a
 * cluster would fail on a machine that has none. `local` is the escape hatch,
 * and it resolves through `command` like any other verb so a command line is
 * still answered in one place (`@@D-1022`).
 */
export interface CliLocalCommand {
    /** Runs in-process; the return value is the exit code (`0` when omitted). */
    local(args: ParsedArgs): Promise<number | void>;
    /** The verb's name, for the message a thrown error is prefixed with. */
    method: string;
}

export interface CliOptions {
    /** The module the `cli` intent loads — normally the realm's `cli.ts`. */
    suite: Parameters<typeof load>[0];
    /** Suite and registry name; also the prefix of every error message. */
    name: string;
    /** Printed for `--help` and before a usage error. */
    usage: string;
    /**
     * Flags to parse as strings (and so to accept repeatedly); every other flag
     * is boolean or numeric.
     */
    stringFlags?: string[];
    /** Intents passed to `load`; defaults to `['cli']`. */
    intents?: string[];
    /** Derive the method and its params from the arguments. */
    command(args: ParsedArgs): CliCommand | CliLocalCommand | undefined;
    /**
     * The text `--help` prints, resolved from the positionals.
     *
     * Progressive, the way `blong-dev` is: the command line alone lists the
     * commands, `blong-kustomize provision --help` describes that command, and
     * `blong-kustomize provision tenant --help` its verb. `undefined` falls back
     * to `usage`, so a realm that has nothing more to say needs no registry.
     */
    help?(positionals: string[]): string | undefined;
    /** Rendering for `--output=text`; `undefined` falls back to JSON. */
    format?(method: string, result: unknown): string | undefined;
    /** Non-zero exit code for a call that completed (e.g. diagnostics errors). */
    exitCodeFor?(method: string, result: unknown): number | undefined;
    /** Appended to the unknown-method error, e.g. where to look next. */
    hint?: string;
}

/** Parse a `process.argv.slice(2)`-style argument list. */
export function parseArgv(args: string[], stringFlags: string[] = []): ParsedArgs {
    const argv = minimist(args, {string: stringFlags}) as Argv;
    return {argv, positionals: argv._.map(String)};
}

/** True when `--help`, `-h` or a leading `help` was asked for. */
export function wantsHelp({argv, positionals}: ParsedArgs): boolean {
    return argv.help === true || argv.h === true || positionals[0] === 'help';
}

/** The subset of the port API dispatch needs (`AdapterBase`). */
export type DispatchPort = {
    handles: (method: string) => boolean;
    findHandler: (method: string) => unknown;
};

export type DispatchTarget = {
    port: DispatchPort;
    fn: (params: unknown, meta: unknown) => Promise<unknown>;
};

/**
 * Locate the port that owns a method.
 *
 * A method only exists if its layer loaded, and it is the port's own handler
 * table that answers — the same entry `Remote._findMethod` resolves to when
 * `canSkipSocket` is set. `handles()` alone is not enough: it matches the
 * namespace **prefix**, so it reports true for a method that does not exist.
 * `findHandler` returning a function is the real test, which is what lets an
 * unknown method be reported as such instead of falling through to an HTTP call
 * against a process that binds no port.
 */
export function resolveMethod(
    registry: {ports: Map<string, unknown>; getPort: (id: string) => unknown},
    method: string,
): DispatchTarget | undefined {
    for (const id of registry.ports.keys()) {
        const port = registry.getPort(id) as DispatchPort | undefined;
        if (typeof port?.findHandler !== 'function') continue;
        if (!port.handles(method)) continue;
        const fn = port.findHandler(method);
        if (typeof fn === 'function') {
            return {port, fn: fn as DispatchTarget['fn']};
        }
    }
    return undefined;
}

/**
 * Whether two names refer to one file, resolving the symlinks on the way.
 *
 * A file has as many names as there are links to it, and the pair that matters is the one a package
 * manager creates: a bin shim re-execs node with the path *through* `node_modules/<pkg>`, while the
 * module's own URL is the real file it links to. Comparing the names unresolved made `isCliEntry`
 * answer false there — the command loaded, printed nothing and exited 0.
 */
export function sameFile(a: string, b: string): boolean {
    const real = (file: string): string => {
        try {
            return realpathSync(file);
        } catch {
            // A path that does not exist yet (or a platform that will not resolve it) compares as
            // itself: the answer is then whatever the plain strings say.
            return file;
        }
    };
    return real(a) === real(b);
}

/**
 * True when this module is the process entry point, so a `bin/*.ts` can be imported by a test without
 * executing the command.
 *
 * The comparison is by real path, not by name: `npm run`, `node_modules/.bin/…` and `npx` all start a
 * bin through a symlink, and a guard that compared the names answered false there — the CLI imported
 * its realm, skipped the command and exited 0 in silence, which is the worst way to fail.
 */
export function isCliEntry(importMetaUrl: string): boolean {
    const entry = process.argv[1];
    if (!entry) return false;
    return sameFile(fileURLToPath(importMetaUrl), entry);
}

/**
 * Run one command and exit with a conventional status.
 *
 * Sets `process.exitCode` rather than calling `process.exit()`, so a caller's
 * own cleanup still runs; `1` means "the command did not do what was asked" for
 * a usage error, an unknown method, a thrown error or a result the caller's
 * `exitCodeFor` rejects.
 */
export async function runCli(options: CliOptions): Promise<void> {
    const {suite, name, usage, intents = ['cli']} = options;
    const args = parseArgv(process.argv.slice(2), options.stringFlags);

    if (wantsHelp(args)) {
        // The leading `help` is the positionals' own word, so it is not part of
        // what names a command: `blong-kustomize help provision` and
        // `blong-kustomize provision --help` ask the same question.
        const named = args.positionals[0] === 'help' ? args.positionals.slice(1) : args.positionals;
        process.stdout.write(options.help?.(named) ?? usage);
        return;
    }
    const command = options.command(args);
    if (!command) {
        process.stderr.write(usage);
        process.exitCode = 1;
        return;
    }
    if ('local' in command) {
        // No suite, no registry, no listeners: the verb writes files or shells
        // out, and a load would only add failure modes (@@D-1022).
        try {
            process.exitCode = (await command.local(args)) ?? 0;
        } catch (error) {
            process.stderr.write(`${name}: ${(error as Error).message}\n`);
            process.exitCode = 1;
        }
        return;
    }

    // Keep stdout for the RESULT only. The loader logs to stdout, and
    // `--output=json` has to stay parseable, so anything written while the realm
    // loads and stops is forwarded to stderr — the loader's messages stay
    // visible, just not on the result channel. `console.log` writes through the
    // replacement too, which is why the result goes through the captured
    // reference instead.
    const json =
        args.argv.output === 'json' || (args.argv.output === undefined && !process.stdout.isTTY);
    const writeResult = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) =>
        process.stderr.write(chunk)) as typeof process.stdout.write;

    try {
        const registry = await load(suite, name, name, intents);
        try {
            // The load step that records handler folders and files still runs
            // under `cli` (it is what feeds `Registry.describe()`); only the
            // watcher and the listeners are off.
            await registry.start({});
            const resolved = resolveMethod(registry, command.method);
            if (!resolved) {
                process.stderr.write(
                    `${name}: unknown method '${command.method}'.${options.hint ? ` ${options.hint}` : ''}\n`,
                );
                process.exitCode = 1;
                return;
            }
            const result = await resolved.fn.call(resolved.port, command.params ?? {}, {
                method: command.method,
            });
            const text = options.format?.(command.method, result);
            writeResult(`${!json && text ? text : JSON.stringify(result, null, 2)}\n`);
            process.exitCode = options.exitCodeFor?.(command.method, result) ?? 0;
        } finally {
            await registry.stop();
        }
    } catch (error) {
        process.stderr.write(`${name}: ${(error as Error).message}\n`);
        process.exitCode = 1;
    }
}
