import {lintCollect, type Diagnostic} from '@feasibleone/blong-lint';
import type {IRegistry} from '@feasibleone/blong/types';
import {fileURLToPath} from 'node:url';
import {
    capitalize,
    PREDICATES,
    type FileChange,
    type Predicate,
    type PrimitiveContext,
    type PrimitiveDescriptor,
    type PrimitiveHost,
} from './engine.ts';
import {getPrimitive, PRIMITIVES} from './primitives/index.ts';

/**
 * What the operation library functions have in common.
 *
 * The operations themselves live in `orchestrator/kukum/` as `library()`
 * functions — one file per API endpoint, reading the platform and the live
 * registry off `this` rather than taking them as arguments. This module holds
 * only the machinery they share: the `this` contract, the argument/result
 * shapes, and the helpers that turn a call into a plan.
 *
 * It is deliberately at the package root and not in `orchestrator/kukum/`:
 * every `.ts` file in a handler *group* folder is loaded as a handler, and a
 * module of shared helpers has nothing for the loader to classify.
 */

export interface OperationParams {
    /** Target realm/suite root. Defaults to the current working directory. */
    target?: string;
    subject?: string;
    object?: string;
    kind?: string;
    layer?: string;
    group?: string;
    platform?: 'server' | 'browser';
    params?: Record<string, unknown>;
    instructions?: string[];
    dryRun?: boolean;
    force?: boolean;
    /**
     * `auto` (default) composes with machine-generated files and leaves
     * hand-written ones alone; `replace` regenerates from scratch.
     */
    mode?: 'auto' | 'replace';
    /** For `source.get`: root-relative file path. */
    path?: string;
    /** For `edit`: full replacement content. */
    content?: string;
    /** For `source.check`: the files to lint (root-relative or absolute). */
    files?: string[];
}

export interface DiagnosticReport {
    diagnostics: Diagnostic[];
    errors: number;
    warnings: number;
    /** Set when diagnostics were not run, with the reason. */
    skipped?: string;
}

export interface OperationResult {
    primitive: string;
    predicate: Predicate;
    kind: string;
    files: Array<{
        path: string;
        content: string;
        action: string;
        handWritten: boolean;
        /** True when the content composes with the file already on disk. */
        merged?: boolean;
    }>;
    written: string[];
    skipped: string[];
    diagnostics?: DiagnosticReport;
    messages?: string[];
    /**
     * Things the caller should know before trusting the result: files that were
     * replaced (which can drop definitions they used to hold), and hand-written
     * files that were refused.
     */
    warnings?: string[];
}

/**
 * What `this` is inside a kukum library function.
 *
 * `Registry._createHandlers` seeds the layer's `lib` object with `platform` and
 * `registry`, and the lib proxy hands an attached function back **raw** — so
 * `this` is that object, not the port (the port is only bound in the proxy's
 * not-yet-attached fallback path).
 */
export type KukumLibContext = {
    platform: PrimitiveHost;
    registry?: IRegistry;
};

/**
 * The realm scaffolding template, resolved as a monorepo sibling.
 *
 * The full canonical realm (entry points, schema, seeds, models, tap and
 * Playwright tests) lives in `@feasibleone/blong-kopi`. It is read as files
 * rather than imported because `blong-gogo` owns `createRealm` and a realm must
 * never depend on the runtime.
 */
export const REALM_TEMPLATE_ROOT = fileURLToPath(new URL('../blong-kopi', import.meta.url));

/**
 * Files that hold more than one entity, so replacing one is lossy.
 *
 * `schema`/`table` and `schema`/`register` both write shared files that every
 * entity in the realm contributes to. `model`, `seed`, `test` and `handler`
 * write per-entity files and are safe to regenerate.
 */
export const SHARED_FILES = new Set(['meta/type/schema.ts', 'meta/db/db.ts']);

/** The descriptor for a primitive, or a clear error naming the unknown id. */
export function descriptorFor(id: string): PrimitiveDescriptor {
    const descriptor = getPrimitive(id);
    if (!descriptor) throw new Error(`Unknown primitive '${id}'`);
    return descriptor;
}

/** The primitive context a descriptor's templates are rendered against. */
export function contextOf(id: string, params: OperationParams): PrimitiveContext {
    return {
        subject: params.subject ?? 'realm',
        object: params.object ?? 'entry',
        kind: params.kind ?? getPrimitive(id)?.defaultKind ?? 'default',
        layer: params.layer,
        group: params.group,
        platform: params.platform ?? 'server',
        params: params.params ?? {},
    };
}

/** The result skeleton every predicate extends. */
export function baseResult(
    id: string,
    predicate: Predicate,
    ctx: PrimitiveContext,
): OperationResult {
    return {
        primitive: id,
        predicate,
        kind: ctx.kind,
        files: [],
        written: [],
        skipped: [],
    };
}

export function collectWarnings(
    primitive: string,
    changes: FileChange[],
    options: {applied: boolean; force?: boolean},
): string[] {
    const warnings: string[] = [];
    for (const change of changes) {
        if (change.action !== 'overwrite') continue;
        // A hand-written file is skipped unless forced, so nothing is at risk.
        if (change.handWritten && !options.force) continue;
        // Composed into the existing file: the neighbouring entities survive, so
        // there is nothing to warn about.
        if (change.merged) continue;
        const verb = options.applied ? 'replaced' : 'would replace';
        if (SHARED_FILES.has(change.path)) {
            warnings.push(
                `${primitive} add ${verb} ${change.path}, which holds every entity in the ` +
                    'realm — definitions for other entities are lost. Re-add them, or keep ' +
                    'this file under version control and merge by hand.',
            );
        } else {
            warnings.push(`${primitive} add ${verb} ${change.path}`);
        }
    }
    return warnings;
}

/** Project a merge-engine `FileChange` down to what the result reports. */
export function toResultFile(change: {
    path: string;
    content: string;
    action: string;
    handWritten: boolean;
    merged?: boolean;
    notices?: string[];
}) {
    return {
        path: change.path,
        content: change.content,
        action: change.action,
        handWritten: change.handWritten,
        merged: change.merged,
    };
}

/** Predicate → method-name fragment, so the handler map can be generated. */
export function methodName(id: string, predicate: Predicate): string {
    return `kukum${capitalize(id)}${capitalize(predicate)}`;
}

/**
 * The `kukum.primitive.find` payload: every primitive with its kinds.
 *
 * Also what the derived validation schema is built from, so the catalogue an
 * agent discovers through the API is the catalogue the schema accepts.
 */
export function describePrimitives() {
    return PRIMITIVES.map(primitive => ({
        id: primitive.id,
        title: primitive.title,
        skill: primitive.skill,
        summary: primitive.summary,
        kinds: primitive.kinds,
        defaultKind: primitive.defaultKind,
        predicates: PREDICATES,
    }));
}

/**
 * Lint a set of files (or a whole package) so an agent gets machine-readable
 * feedback from the same tsc/cspell/eslint pipeline `blong-dev lint` uses.
 */
export async function diagnoseFor(
    host: PrimitiveHost,
    root: string,
    files: string[],
    scope: 'changed' | 'package' = 'changed',
): Promise<DiagnosticReport | undefined> {
    if (!files.length) return undefined;
    // A freshly scaffolded package has no installed dependencies, so tsc would
    // report hundreds of unresolved-import errors that say nothing about the
    // generated code. Report that honestly instead of a wall of noise.
    if (!host.existsSync(host.join(root, 'node_modules'))) {
        return {
            diagnostics: [],
            errors: 0,
            warnings: 0,
            skipped: 'node_modules is not installed in the target package',
        };
    }
    try {
        const {diagnostics} = await lintCollect(root, {
            ...(scope === 'changed' ? {files} : {}),
            scope,
        });
        return {
            diagnostics,
            errors: diagnostics.filter(d => d.severity === 'error').length,
            warnings: diagnostics.filter(d => d.severity === 'warning').length,
        };
    } catch (error) {
        return {
            diagnostics: [
                {
                    tool: 'tsc',
                    severity: 'warning',
                    message: `diagnostics unavailable: ${(error as Error).message}`,
                },
            ],
            errors: 0,
            warnings: 1,
        };
    }
}

/** Lint the files a scaffold or edit just touched. */
export async function diagnose(
    host: PrimitiveHost,
    root: string,
    files: string[],
): Promise<DiagnosticReport | undefined> {
    return diagnoseFor(host, root, files, 'changed');
}
