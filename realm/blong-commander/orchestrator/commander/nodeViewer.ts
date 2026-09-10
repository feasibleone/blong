import {handler} from '@feasibleone/blong';
import type {ICommanderSource} from '../../types.ts';
import {sources as defaultSources} from '../../config/sources.ts';

/**
 * commanderNodeViewer — resolve the viewer for a leaf node.
 * Returns the explicit `viewer` type, `model` when the `{subject}.{object}`
 * is recognized by the model system (`subject.model.list`), else `json`.
 */
export default handler(
    ({config, handler: h}) =>
        async function commanderNodeViewer(
            params: {source: string; level: number},
            $meta: Record<string, unknown>,
        ) {
            const sources = (config as {sources?: ICommanderSource[]}).sources ?? defaultSources;
            const source = sources.find(s => s.name === params.source);
            if (!source) throw new Error(`Unknown commander source: ${params.source}`);
            const level = source.levels[params.level];
            if (level?.viewer) return {viewer: level.viewer};
            if (level?.model) {
                const models = (await h['subject.model.list']({}, $meta)) as
                    | Array<{subject?: string; object?: string}>
                    | undefined;
                const recognized = (models ?? []).some(
                    model =>
                        model.subject === level.model?.subject &&
                        model.object === level.model?.object,
                );
                if (recognized) return {viewer: 'model', model: level.model};
            }
            return {viewer: 'json'};
        },
);
