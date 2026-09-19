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
        dev: {
            imports: [/\.subject$/, /\.subject\.dev$/, /\.model$/, /\.model\.dev$/],
        },
    },
    async createHandlers({handlers, kind}: {handlers: object; layerApi: unknown; kind: string}) {
        if (kind !== 'model') return;
        const config = this.config as {context?: {subjectModels?: Record<string, IModelSpec>}};
        const context = config.context ?? {};
        config.context = context;
        context.subjectModels ??= {};
        // The model handlers arrive as a collection keyed by *position* — one
        // factory per call, under `0` — so their names are on the factories
        // themselves, which are the names the registry resolved when it registered
        // them. Asking `Object.keys` for those names was a question this shape
        // cannot answer, so the warning below fired for every model of every realm
        // — forty lines in one realm's boot — while naming a handler that was
        // registered and working all along. Fold both sides for the comparison,
        // because handler keys are `methodId`-normalised (lookups normalise too,
        // which is why the model worked regardless), and what is left is a genuine
        // mismatch: a wrong file name, or the `$`-placeholder capitalisation the
        // comment below is about.
        const available = new Set(
            Object.values(handlers as Record<string, {name?: string}>)
                .map(factory => factory?.name)
                .filter((name): name is string => typeof name === 'string')
                .map(name => name.toLowerCase()),
        );
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
            const object = model.object.replace(
                /^(\$*)([a-z])/,
                (_m, pre: string, c: string) => pre + c.toUpperCase(),
            );
            const handlerName = `${model.subject}${object}Model`;
            // Visibility: a genuinely missing model handler is worth a warning,
            // because `subject.validation` then calls a method that does not exist
            // (a silent hang or a binding failure) and the symptom names nothing.
            // The comparison is on the normalised form (see above), so it fires for
            // a wrong file name or a `$`-placeholder capitalisation, and not for
            // the case difference that made it fire for every model before.
            if (!available.has(handlerName.toLowerCase())) {
                const registered = [...available].filter(n =>
                    n.startsWith(model.subject.toLowerCase()),
                );
                this.log?.warn?.({
                    $meta: {mtid: 'event', method: 'subject.subjectModelList'},
                    message:
                        `Model handler name mismatch: derived '${handlerName}' is not a registered ` +
                        `model handler; expected file '${handlerName}.ts'` +
                        (registered.length > 0
                            ? ` (registered for '${model.subject}': ${registered.join(', ')})`
                            : '') +
                        '.',
                });
            }
            context.subjectModels[handlerName] = model;
        }
    },
}));
