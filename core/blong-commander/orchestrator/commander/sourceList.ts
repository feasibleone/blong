import {handler} from '@feasibleone/blong';
import type {ICommanderSource} from '../../types.ts';
import {sources as defaultSources} from '../../config/sources.ts';

/** Normalise a triple to the gateway methodId (dots stripped, lowercased). */
const methodId = (name: string): string => name.replace(/\./g, '').toLowerCase();

/**
 * commanderSourceList — return the configured commander sources, filtered by
 * the caller's granted actions (`$meta.auth.actions`, populated by the gateway
 * authorize handler). Sources/levels without a `permission` are always shown.
 */
export default handler(
    ({config}) =>
        async function commanderSourceList(_params, $meta) {
            const sources = (config as {sources?: ICommanderSource[]}).sources ?? defaultSources;
            const actions = ($meta as {auth?: {actions?: string[]}}).auth?.actions;
            const allowed = actions?.length ? new Set(actions.map(methodId)) : null;
            const canShow = (permission?: string): boolean => {
                if (!permission || !allowed) return true;
                return allowed.has(methodId(permission));
            };
            const items = sources
                .filter(source => canShow(source.permission))
                .map(source => ({
                    ...source,
                    levels: source.levels.filter(level => canShow(level.permission)),
                }));
            return {items};
        },
);
