/**
 * orchestrator/subject.ts — dispatch all configured subject.* calls to the backend.
 *
 * Also imports the realm's `*.model` files (like the browser portal does) so
 * `subject.validation` can enumerate the actual model handlers through
 * `subjectObjectModelList` instead of probing every schema-derived name.
 */
import {orchestrator, type IModelSpec} from '@feasibleone/blong';

export default orchestrator<{
    context?: {
        subjectModels?: Record<string, IModelSpec>;
    };
}>(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: 'subject',
            imports: [/\.subject$/, /\.model$/],
            destination: 'db',
        },
    },
    async createHandlers({handlers, kind}: {handlers: object; layerApi: unknown; kind: string}) {
        if (kind !== 'model') return;
        const config = this.config as {context?: {subjectModels?: Record<string, IModelSpec>}};
        const context = config.context ?? {};
        config.context = context;
        context.subjectModels ??= {};
        const models = (await Promise.all(
            Object.values(handlers as Record<string, () => Promise<IModelSpec>>).map(model =>
                model(),
            ),
        )) as IModelSpec[];
        for (const model of models) {
            if (!model?.subject || !model?.object) continue;
            const handlerName = `${model.subject}${model.object.charAt(0).toUpperCase()}${model.object.slice(1)}Model`;
            context.subjectModels[handlerName] = model;
        }
        return {
            subjectObjectModelList: async () => context.subjectModels ?? {},
        };
    },
}));
