import {validation, type IModelSpec} from '@feasibleone/blong';
import {subjectModelFind} from '../../subjectModels.ts';

/**
 * `subject.validation` — generate the default gateway validations for the
 * standard CRUD operations (`find/get/add/edit/remove/report` + `dropdown.list`)
 * of the public models.
 *
 * Every model that declares `public: true` in its spec is validated by default —
 * a suite only opts out in rare cases (e.g. mocks until the DB schema is
 * defined).  Config (suite `index.ts` / `server.ts`, under `srv`):
 *
 * ```ts
 * srv: {
 *     'subject.validation': {
 *         // Default — every `public: true` model is validated (no config needed):
 *         // validations: true,
 *         // Opt-out everything (e.g. use mocks until the DB schema is defined):
 *         // validations: false,
 *         // Per-model overrides — opt-out (`false`) or force-include (`true`):
 *         // validations: {gatewaySubscriptionModel: false},
 *     },
 * },
 * ```
 *
 * A model declares `public: true` in its IModelSpec as the "public API" marker.
 */
export default validation<{
    validations?: boolean | Record<string, boolean | RegExp>;
}>(async ({lib: {type, mergeWithSymbols}, config: {validations}, handler, schema}) => {
    const result = {
        'subject.object.schema': () => ({
            params: type.Object({
                subject: type.String(),
                object: type.Optional(type.String()),
            }),
            result: type.Unknown(),
        }),
    };
    const {validation} = await import('@feasibleone/blong-mock');
    // Public models are exposed by default; a suite opts out only in rare
    // cases (e.g. `validations: false` until the DB schema is defined).
    const enabled = (validations ?? true) as boolean | Record<string, boolean | RegExp>;
    // Read from the module the port writes rather than through the proxy: this definition is not
    // attached to the `srv.subject` port, so the proxy it holds resolves `subjectModelList` against
    // the *default* namespace — and a realm whose `orchestrator/subject/init.ts` answers under its
    // own name (`core`, `access`, …) stops answering `subject` at all, so the call left the process
    // and the boot ended with `getaddrinfo ENOTFOUND subject.<ns>.svc.cluster.local`. A module is one
    // instance per process, so what the port collected is what this reads (F-435, D-459).
    const modelNames = await resolveModelHandlerNames(enabled, () => subjectModelFind());
    if (modelNames.length === 0) return result;
    // A model the list names and this process cannot answer is not a reason to refuse to start.
    // The list is built from every realm that declares one, and which handler a process holds
    // depends on the folders its intents load — the same suite under `dev` and under
    // `microservice` answers a different set, and `microservice` is the one a pod runs. Skipping
    // an unanswerable model matches the warning the list already emits for a name it cannot
    // match; the alternative was a validation, and a process, that could not start — a TypeError
    // raised from a `map` that named nothing, which is what stopped the first deployed suite
    // (T-223). The skip is silent because a validation's context carries no logger; that hole is
    // recorded with it.
    const models = (
        await Promise.all(
            modelNames.map(async handlerName => {
                const model = (await handler[handlerName]({}, {})) as IModelSpec | undefined;
                if (!model || typeof model !== 'object' || !model.subject || !model.object) {
                    return undefined;
                }
                if (!schema?.[model.subject]?.[model.object]) {
                    // The spec is there but the schema to describe it is not, and a validation
                    // built on it would describe nothing.
                    return undefined;
                }
                return model;
            }),
        )
    ).filter((model): model is IModelSpec => model !== undefined);
    if (models.length === 0) return result;
    return {
        ...result,
        ...validation(
            models.map((model: IModelSpec) =>
                mergeWithSymbols(
                    {
                        schema: type.Object({
                            [model.object]: schema[model.subject][model.object],
                        }),
                    },
                    model,
                ),
            ) as Parameters<typeof validation>[0],
        ),
    };
});

/**
 * Resolve the model handler names to validate.
 *
 * - `validations` absent or `true` — every model that declares `public: true`.
 * - `false` — nothing (opt-out all, e.g. mocks until the DB schema is defined).
 * - Object map — per-model overrides on top of the default: `false` opts a
 *   model out, `true` force-includes it (even if not marked `public`).
 */
async function resolveModelHandlerNames(
    validations: boolean | Record<string, boolean | RegExp>,
    listModels: () => unknown,
): Promise<string[]> {
    const models = (await listModels()) as Record<string, {public?: boolean}> | undefined;
    if (typeof validations === 'boolean') {
        if (!validations) return [];
        return Object.entries(models ?? {})
            .filter(([, spec]) => spec?.public)
            .map(([name]) => name);
    }
    const names = new Set(
        Object.entries(models ?? {})
            .filter(([, spec]) => spec?.public)
            .map(([name]) => name),
    );
    for (const [name, value] of Object.entries(validations)) {
        if (value) names.add(name);
        else names.delete(name);
    }
    return [...names];
}
