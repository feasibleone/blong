import {orchestrator, server, type Definition, type SolutionFactory} from '@feasibleone/blong/types';
import {existsSync} from 'fs';
import {readdir} from 'fs/promises';
import type {Dirent} from 'node:fs';
import {basename, extname, join} from 'path';

import {Type} from 'typebox';
import merge from 'ut-function.merge';

/**
 * Well-known layer folder names (first segment only).
 * Kept in sync with WELL_KNOWN_LAYERS in load.ts.
 */
const WELL_KNOWN_LAYER_DIRS = new Set([
    'init',
    'server',
    'browser',
    'error',
    'sim',
    'adapter',
    'orchestrator',
    'gateway',
    'backend',
    'component',
    'test',
]);

/** Structural file names that are NOT handlers. */
const STRUCTURAL_NAMES = new Set([
    'server',
    'browser',
    'index',
    'config',
    'realm',
    'layer',
]);

/** Returns true if the filename is a TypeScript/JavaScript source file. */
const isCode = (name: string): boolean => /(?<!\.d)\.m?(t|j)sx?$/i.test(name);

/**
 * Returns true if the bare name (no extension) looks like a blong handler
 * using the camelCase triple-naming convention, e.g. `helloHello`,
 * `mathNumberSum`.  A handler name must start with a lowercase letter and
 * contain at least one internal uppercase letter.
 */
const isHandlerName = (name: string): boolean =>
    /^[a-z][a-zA-Z0-9]*[A-Z]/.test(name) && !STRUCTURAL_NAMES.has(name);

export type FolderAnalysisKind = 'suite' | 'realm' | 'handlers' | 'mixed' | 'unknown';

export interface FolderAnalysis {
    kind: FolderAnalysisKind;
    /** Absolute paths of discovered handler files (only for 'handlers'/'mixed'). */
    handlerFiles?: string[];
    /** Inferred namespace names, one per unique first camelCase word. */
    namespaces?: string[];
    /** True when a config.ts is present at CWD root. */
    hasConfig?: boolean;
}

/**
 * Scans a directory and classifies its contents to decide how to run it.
 *
 * Classification priority (first match wins):
 * - `suite`    – has server.ts / browser.ts / index.ts
 * - `realm`    – has realm.ts
 * - `handlers` – has handler files with no well-known layer sub-folders
 * - `mixed`    – has handler files AND well-known layer sub-folders
 * - `unknown`  – nothing useful found
 */
export async function analyzeFolder(cwd: string): Promise<FolderAnalysis> {
    let entries: Dirent[];
    try {
        entries = await readdir(cwd, {withFileTypes: true});
    } catch {
        return {kind: 'unknown'};
    }

    let hasSuiteEntry = false;
    let hasRealmEntry = false;
    let hasConfig = false;
    let hasWellKnownLayerDir = false;
    const handlerFiles: string[] = [];

    for (const entry of entries) {
        // Skip hidden and schema-generated files
        if (entry.name.startsWith('.') || entry.name.startsWith('~')) continue;

        if (entry.isDirectory()) {
            if (WELL_KNOWN_LAYER_DIRS.has(entry.name)) hasWellKnownLayerDir = true;
        } else if (entry.isFile() && isCode(entry.name)) {
            const nameNoExt = basename(entry.name, extname(entry.name));
            if (nameNoExt === 'server' || nameNoExt === 'browser' || nameNoExt === 'index') {
                hasSuiteEntry = true;
            } else if (nameNoExt === 'realm') {
                hasRealmEntry = true;
            } else if (nameNoExt === 'config') {
                hasConfig = true;
            } else if (isHandlerName(nameNoExt)) {
                handlerFiles.push(join(cwd, entry.name));
            }
        }
    }

    if (hasSuiteEntry) return {kind: 'suite'};
    if (hasRealmEntry) return {kind: 'realm'};

    if (handlerFiles.length > 0) {
        const namespaces = [
            ...new Set(
                handlerFiles.map(f => {
                    const name = basename(f, extname(f));
                    // First lowercase camelCase word is the namespace
                    return name.replace(/^([a-z]+).*$/, '$1');
                }),
            ),
        ];
        return {
            kind: hasWellKnownLayerDir ? 'mixed' : 'handlers',
            handlerFiles,
            namespaces,
            hasConfig,
        };
    }

    return {kind: 'unknown'};
}

/**
 * Builds a synthetic `server()` factory from a folder containing loose handler
 * files.  Called when `analyzeFolder` returns `'handlers'` or `'mixed'`.
 *
 * What it does:
 * 1. Imports each handler file and groups them by namespace (first camelCase
 *    word of the handler name, e.g. `helloHello` → namespace `hello`).
 * 2. Creates an inline layer-function child per namespace that registers
 *    the handler methods with the framework.
 * 3. Creates a dispatch-orchestrator child per namespace that exposes the
 *    namespace via the JSON-RPC gateway.
 * 4. Optionally merges a `config.ts` override from the same folder.
 * 5. Returns a `server()` factory ready to be passed to `loadRealm`.
 *
 * The caller is expected to pass the returned factory to `loadRealm` using
 * `basename(cwd)` as the `name` argument so that method-group IDs align with
 * the dispatch-orchestrator `imports` config.
 */
export async function synthesizeServerFromHandlers(
    cwd: string,
    analysis: FolderAnalysis,
): Promise<SolutionFactory> {
    const realmName = basename(cwd);

    // ── 1. Import handlers and group by namespace ──────────────────────────────
    const namespaceGroups = new Map<string, Array<Definition<Record<string, unknown>>>>();

    for (const filePath of analysis.handlerFiles ?? []) {
        const handlerName = basename(filePath, extname(filePath));
        const namespace = handlerName.replace(/^([a-z]+).*$/, '$1');
        let handlerDef: Definition<Record<string, unknown>> | undefined;
        try {
            const mod = await import(filePath);
            handlerDef = mod?.default;
        } catch {
            // Skip files that cannot be imported
            continue;
        }
        if (!handlerDef) continue;

        // Ensure the handler has the correct name property (mirrors Watch.ts behaviour)
        if (typeof handlerDef === 'function') {
            const actualName: string | undefined =
                (handlerDef as {name?: string}).name &&
                (handlerDef as {name?: string}).name !== 'default'
                    ? (handlerDef as {name: string}).name
                    : undefined;
            if (!actualName) {
                Object.defineProperty(handlerDef, 'name', {
                    value: handlerName,
                    configurable: true,
                    enumerable: false,
                });
            }
        }

        if (!namespaceGroups.has(namespace)) namespaceGroups.set(namespace, []);
        namespaceGroups.get(namespace)!.push(handlerDef);
    }

    // ── 2. Build inline children and config keys ───────────────────────────────
    const children: Array<() => Promise<unknown>> = [];
    const configDefault: Record<string, unknown> = {};

    for (const [namespace, handlers] of namespaceGroups) {
        const ns = namespace;
        const nsHandlers = [...handlers];

        // Inline layer function: registers handler methods for this namespace
        const handlerChild = Object.defineProperty(
            async function () {
                return (api: Record<string, (...args: unknown[]) => unknown>) => {
                    api[ns](nsHandlers, `${realmName}.${ns}`, cwd);
                    return api;
                };
            },
            'name',
            {value: ns},
        );
        children.push(handlerChild as () => Promise<unknown>);
        configDefault[ns] = true;

        // Dispatch orchestrator: exposes namespace via JSON-RPC gateway
        const dispatchName = `${ns}Dispatch`;
        const dispatchFactory = orchestrator(() => ({
            extends: 'orchestrator.dispatch',
            activation: {
                default: {
                    namespace: [ns],
                    imports: [`${realmName}.${ns}`],
                },
            },
        }));
        const dispatchChild = Object.defineProperty(
            async function () {
                return (api: Record<string, (...args: unknown[]) => unknown>) => {
                    api[dispatchName](dispatchFactory, `${realmName}.${dispatchName}`, cwd);
                    return api;
                };
            },
            'name',
            {value: dispatchName},
        );
        children.push(dispatchChild as () => Promise<unknown>);
        configDefault[dispatchName] = true;
    }

    // ── 3. Read optional config.ts override ───────────────────────────────────
    let userConfig: Record<string, unknown> = {};
    if (analysis.hasConfig) {
        try {
            const cfgMod = await import(join(cwd, 'config.ts'));
            const raw = cfgMod?.default;
            if (typeof raw === 'function') {
                userConfig = (raw({type: Type}) as Record<string, unknown>) ?? {};
            } else if (raw && typeof raw === 'object') {
                userConfig = raw as Record<string, unknown>;
            }
        } catch {
            // Ignore config load errors
        }
    }

    // ── 4. Read package.json for pkg metadata ──────────────────────────────────
    let pkg: {name: string; version: string} = {name: realmName, version: '0.0.0'};
    try {
        const pkgPath = join(cwd, 'package.json');
        if (existsSync(pkgPath)) {
            const pkgMod = (await import(pkgPath, {with: {type: 'json'}})).default as Record<
                string,
                string
            >;
            pkg = {
                name: pkgMod.name || realmName,
                version: pkgMod.version || '0.0.0',
            };
        }
    } catch {
        // Use default pkg
    }

    // ── 5. Build and return the synthetic server factory ──────────────────────
    const factoryFn: SolutionFactory = () =>
        merge(
            {
                url: `file://${cwd}/server.ts`,
                pkg,
                children,
                config: {
                    default: {
                        rpcServer: {port: 0},
                        gateway: {port: 8080},
                        ...configDefault,
                    },
                    integration: {
                        remote: {canSkipSocket: true},
                        watch: {test: []},
                    },
                },
            },
            userConfig,
        ) as ReturnType<SolutionFactory>;
    return server(factoryFn);
}
