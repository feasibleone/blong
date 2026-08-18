/**
 * orchestrator/subject.ts — dispatch all configured subject.* calls to the backend.
 *
 * Also imports the realm's `*.model` files (like the browser portal does) so
 * `subject.validation` can enumerate the actual model handlers through
 * `subjectModelList` instead of probing every schema-derived name.
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
        const available = new Set(Object.keys(handlers));
        const models = (await Promise.all(
            Object.values(handlers as Record<string, () => Promise<IModelSpec>>).map(model =>
                model(),
            ),
        )) as IModelSpec[];
        for (const model of models) {
            if (!model?.subject || !model?.object) continue;
            // `$`-aware capitalise: `$object` → `$Object` (a leading `$` — the
            // `$subject`/`$object` template placeholder — must not prevent the
            // first letter from being capitalised, or the derived handler name
            // (`$subject$objectModel`) stops matching the `$subject$ObjectModel`
            // file).
            const object = model.object.replace(/^(\$*)([a-z])/, (_m, pre: string, c: string) =>
                pre + c.toUpperCase(),
            );
            const handlerName = `${model.subject}${object}Model`;
            // Visibility: the derived name must match the model handler file
            // actually registered (e.g. `$subject$ObjectModel.ts`). A mismatch
            // here makes `subject.validation` call a method that doesn't exist
            // (silent hang / binding failure) — warn so the cause is obvious.
            if (!available.has(handlerName)) {
                const suggested = [...available].find(
                    n => n.toLowerCase() === handlerName.toLowerCase(),
                );
                this.log?.warn?.({
                    $meta: {mtid: 'event', method: 'subject.subjectModelList'},
                    message: `Model handler name mismatch: derived '${handlerName}' is not a registered model handler; expected file '${handlerName}.ts'${
                        suggested
                            ? ` (closest match '${suggested}' — likely a capitalisation or \`$\`-placeholder issue)`
                            : ''
                    }.`,
                });
            }
            context.subjectModels[handlerName] = model;
        }
    },
}));
