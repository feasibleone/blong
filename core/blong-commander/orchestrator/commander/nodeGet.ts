import {handler} from '@feasibleone/blong';
import type {ICommanderSource} from '../../types.ts';
import {sources as defaultSources} from '../../config/sources.ts';

/** Resolve `{field}` tokens against the node. */
function resolve(text: string, node: Record<string, unknown> | null): string {
    return text.replace(/\{([^}]+)\}/g, (_match, expr: string) => {
        const value = node?.[expr.trim()];
        return value === undefined || value === null ? '' : String(value);
    });
}

/**
 * commanderNodeGet — fetch a leaf node's full content via the level's `open`
 * triple (e.g. `{ns}.pod.log`, `{ns}.object.get`, `{ns}.secret.get`).
 */
export default handler(
    ({config, handler: h}) =>
        async function commanderNodeGet(
            params: {source: string; level: number; node?: Record<string, unknown>},
            $meta: Record<string, unknown>,
        ) {
            const sources = (config as {sources?: ICommanderSource[]}).sources ?? defaultSources;
            const source = sources.find(s => s.name === params.source);
            if (!source) throw new Error(`Unknown commander source: ${params.source}`);
            const level = source.levels[params.level];
            const node = params.node ?? {};
            if (!level?.open) return node;
            const method = resolve(level.open.method, node);
            const openParams: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(level.open.params ?? {})) {
                openParams[key] = typeof value === 'string' ? resolve(value, node) : value;
            }
            return h[method](openParams, $meta);
        },
);
