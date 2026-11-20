/**
 * A destination for this process's records, named by configuration.
 *
 * A process writes to stdout until something installs a writer. The common case is a collector that
 * speaks the batch format lukaot's own sink sends, so the configuration can be an address and nothing
 * else:
 *
 * ```yaml
 * log:
 *     destination: {host: blong-log, port: 9999}
 * ```
 *
 * The block may instead name a module, which the loader imports and hands its options; what comes back
 * must be a lukaot `Writer` — an object with `write(line, record)` — the same shape `setWriter` takes, so
 * a plain `{write}` object from a test's own module is as valid as the shipped one:
 *
 * ```yaml
 * log:
 *     destination: '@feasibleone/lukaot'            # a module, defaults for the rest
 *     # destination: {module: 'my-writer.ts', options: {…}}
 * ```
 *
 * There is no dependency from this package onto a viewer: the sink ships in `@feasibleone/lukaot/node`,
 * which this loader already has, so the address form needs nothing installed beside the process
 * (`@@D-930`).
 *
 * A module name is resolved from the working directory the configuration was read in, because the
 * package that imports it is the one that must not depend on it; with nothing installed beside the
 * process, a relative path names the file instead (`./tools/my-writer.ts`).
 *
 * This file is imported dynamically, and on the server platform only: it reaches `node:module`,
 * `node:path` and `node:dgram`, which a page's bundle must never meet (`@@T-732`).
 */

import {
    createFanoutWriter,
    createUdpWriter,
    getWriter,
    setWriter,
    stdoutWriter,
    type IUdpWriterOptions,
    type Writer,
} from '@feasibleone/lukaot/node';
import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

/** What the configuration says about the destination. */
export type DestinationEntry =
    | string
    | boolean
    | {module: string; options?: Record<string, unknown>}
    | IUdpWriterOptions;

/** A destination as the loader reads it: the sink it builds, or the module it imports. */
export type Destination =
    | {kind: 'udp'; options: IUdpWriterOptions}
    | {kind: 'module'; module: string; options: Record<string, unknown>};

/** The scheme that makes a block an address rather than a module name. */
const UDP_SCHEME = 'udp://';

/** A `udp://host:port` address as the sink's options, or `undefined` when it is not one. */
function addressOptions(address: string): IUdpWriterOptions | undefined {
    if (!address.startsWith(UDP_SCHEME)) return undefined;
    try {
        const url = new URL(address);
        return {
            host: url.hostname || undefined,
            port: url.port ? Number(url.port) : undefined,
        };
    } catch {
        return undefined;
    }
}

/**
 * The destination a `log.destination` block names.
 *
 * The block is read in this order: an address (`udp://…`), a module name, `true` for the sink with its
 * defaults, then an object — the sink's options when it names no module, and a module with its options
 * when it does. Anything else names nothing, and a process that named nothing keeps writing to stdout.
 */
export function resolveDestination(entry: unknown): Destination | undefined {
    if (typeof entry === 'string' && entry.length > 0) {
        const address = addressOptions(entry);
        if (address !== undefined) return {kind: 'udp', options: address};
        return {kind: 'module', module: entry, options: {}};
    }
    if (entry === true) return {kind: 'udp', options: {}};
    if (entry === null || typeof entry !== 'object') return undefined;
    const {module, options} = entry as {module?: unknown; options?: unknown};
    if (typeof module === 'string' && module.length > 0) {
        return {
            kind: 'module',
            module,
            options:
                options !== null && typeof options === 'object'
                    ? (options as Record<string, unknown>)
                    : {},
        };
    }
    if (module !== undefined) return undefined;
    // No module in the block, so the block is the sink's own options.
    return {kind: 'udp', options: entry as IUdpWriterOptions};
}

/**
 * The specifier to import for a module the configuration names.
 *
 * `import('…')` resolves against *this* file, and this package does not depend on the package a
 * configuration names — that is the point of naming it — so a bare name would never be found. It is
 * resolved from the working directory instead, which is where the configuration that named it was read
 * from. An absolute path and a `file:` URL are taken as written, so a test can point at its own fixture.
 */
export function destinationSpecifier(module: string, base = process.cwd()): string {
    if (module.startsWith('file:')) return module;
    if (path.isAbsolute(module)) return pathToFileURL(module).href;
    if (module.startsWith('.')) return pathToFileURL(path.resolve(base, module)).href;
    try {
        return pathToFileURL(createRequire(path.join(base, 'noop.mjs')).resolve(module)).href;
    } catch {
        return module;
    }
}

/** The writer a destination answered, plus the verb a process needs to stop it cleanly. */
export interface IInstalledDestination {
    writer: Writer;
    /** Flush and release what the destination holds, when it can. */
    close(): void;
}

/** A writer that may know how to be stopped. */
type StoppableWriter = Writer & {close?: () => void; flush?: () => void};

/** The writer a module the configuration named answers, or `undefined` when it answers none. */
async function moduleWriter(
    module: string,
    options: Record<string, unknown>,
    warn: (message: string, reason: string) => void,
): Promise<StoppableWriter | undefined> {
    let factory: unknown;
    try {
        const imported = (await import(/* @vite-ignore */ destinationSpecifier(module))) as {
            default?: unknown;
        };
        factory = imported.default ?? imported;
    } catch (error) {
        warn(
            `log.destination: ${module} could not be imported; records stay where they were`,
            error instanceof Error ? error.message : String(error),
        );
        return undefined;
    }
    if (typeof factory !== 'function') {
        warn(
            `log.destination: ${module} exports no factory; records stay where they were`,
            'the module must default-export a function taking the options and answering a writer',
        );
        return undefined;
    }
    let writer: unknown;
    try {
        writer = await (factory as (options: Record<string, unknown>) => unknown)(options);
    } catch (error) {
        warn(
            `log.destination: ${module} threw while starting; records stay where they were`,
            error instanceof Error ? error.message : String(error),
        );
        return undefined;
    }
    if (
        writer === null ||
        typeof writer !== 'object' ||
        typeof (writer as Writer).write !== 'function'
    ) {
        warn(
            `log.destination: ${module} answered no writer; records stay where they were`,
            'the factory must answer an object with write(line, record)',
        );
        return undefined;
    }
    return writer as StoppableWriter;
}

/**
 * Read the block, build or import what it names, and install it as the process writer.
 *
 * A destination that cannot be built is reported and then skipped rather than thrown: a collector's
 * address being wrong must cost the records it would have received, not the process that was writing
 * them. The caller passes the reporter, because the log this runs beside is the only thing that can say
 * so (`@@D-930`).
 */
export async function installDestination(
    entry: unknown,
    warn: (message: string, reason: string) => void,
): Promise<IInstalledDestination | undefined> {
    const destination = resolveDestination(entry);
    if (destination === undefined) return undefined;
    const writer: StoppableWriter | undefined =
        destination.kind === 'udp'
            ? createUdpWriter(destination.options)
            : await moduleWriter(destination.module, destination.options, warn);
    if (writer === undefined) return undefined;
    // **Added**, not substituted: a destination is where a record also goes, never where the terminal's
    // copy stops. Installing one as the only writer silenced a configured process completely — a
    // fixture that reports "nothing to run" on stdout never said it, and the spawn test that waits for
    // that line hung for its full two minutes (`@@D-930`).
    setWriter(createFanoutWriter([getWriter() ?? stdoutWriter, writer]));
    return {
        writer,
        close: () => {
            writer.close?.();
            writer.flush?.();
        },
    };
}
