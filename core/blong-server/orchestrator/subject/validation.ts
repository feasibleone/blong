import {validation, type IModelSpec} from '@feasibleone/blong';

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
    const modelNames = await resolveModelHandlerNames(enabled, () =>
        handler['subjectModelList']({}, {}),
    );
    if (modelNames.length === 0) return result;
    return {
        ...result,
        ...validation(
            (
                (await Promise.all(
                    modelNames.map(handlerName => handler[handlerName]({}, {})),
                )) as unknown as IModelSpec[]
            ).map((model: IModelSpec) =>
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
