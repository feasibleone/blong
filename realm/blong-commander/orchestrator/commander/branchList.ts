import {handler} from '@feasibleone/blong';
import type {ICommanderSource} from '../../types.ts';
import {sources as defaultSources} from '../../config/sources.ts';

function getPath(obj: Record<string, unknown> | undefined, path: string): unknown {
    if (!obj) return undefined;
    let cur: unknown = obj;
    for (const part of path.split('.')) {
        if (cur === null || cur === undefined) return undefined;
        cur = (cur as Record<string, unknown>)[part];
    }
    return cur;
}

/**
 * One-level flatten: keep top-level scalar fields; promote the scalar leaves of
 * nested plain objects to dot-path keys. Arrays and deeper nesting are skipped.
 * Backends return heterogeneous rows (e.g. raw Kubernetes objects with
 * `metadata.name` / `status.phase`) — this makes every row displayable by the
 * generic commander table (which only shows scalar cells).
 */
function flattenItem(item: unknown): Record<string, unknown> {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return {};
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(item)) {
        if (value === null || value === undefined) {
            out[key] = value;
            continue;
        }
        if (typeof value !== 'object' || Array.isArray(value)) {
            if (typeof value !== 'object') out[key] = value;
            continue;
        }
        for (const [subKey, subValue] of Object.entries(value)) {
            if (subValue !== null && subValue !== undefined && typeof subValue !== 'object') {
                out[`${key}.${subKey}`] = subValue;
            }
        }
    }
    return out;
}

/** Resolve `{field}` / `{parent.field}` tokens against the parent node. */
function resolve(text: string, parent: Record<string, unknown> | null): string {
    return text.replace(/\{([^}]+)\}/g, (_match, expr: string) => {
        const raw = expr.trim();
        const path = raw.startsWith('parent.') ? raw.slice('parent.'.length) : raw;
        // Rows are flattened to literal dot-path keys (e.g. `metadata.name`), so
        // prefer a direct lookup; fall back to nested traversal for raw objects.
        const literal = parent ? parent[path] : undefined;
        const value =
            literal !== undefined && literal !== null ? literal : getPath(parent ?? undefined, path);
        return value === undefined || value === null ? '' : String(value);
    });
}

/**
 * commanderBranchList — generic children dispatch.
 *
 * `level: -1` lists the source root children (`levels[0].list`); `level: n`
 * lists the children of a node at depth n (`levels[n + 1].list`). The method
 * and params are resolved from the descriptor, templating `{field}` /
 * `{parent.field}` against the parent node.
 */
export default handler(
    ({config, handler: h}) =>
        async function commanderBranchList(
            params: {
                source: string;
                level?: number;
                parent?: Record<string, unknown>;
                paging?: {pageSize?: number; pageNumber?: number};
            },
            $meta: Record<string, unknown>,
        ) {
            const sources = (config as {sources?: ICommanderSource[]}).sources ?? defaultSources;
            const source = sources.find(s => s.name === params.source);
            if (!source) throw new Error(`Unknown commander source: ${params.source}`);
            const levelIndex = params.level ?? -1;
            const next = levelIndex + 1;
            if (next >= source.levels.length) return {items: []};
            const level = source.levels[next];
            const parent = levelIndex >= 0 ? (params.parent ?? null) : null;

            const method = resolve(level.list.method, parent);
            const listParams: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(level.list.params ?? {})) {
                listParams[key] = typeof value === 'string' ? resolve(value, parent) : value;
            }
            if (params.paging) listParams.paging = params.paging;

            const result = await h[method](listParams, $meta);
            if (Array.isArray(result)) {
                return {items: result.map(flattenItem)};
            }
            const resultSet = level.list.resultSet;
            if (resultSet && result && typeof result === 'object') {
                const items = (result as Record<string, unknown>)[resultSet];
                if (Array.isArray(items)) return {items: items.map(flattenItem)};
                return {items: []};
            }
            return {items: []};
        },
);
