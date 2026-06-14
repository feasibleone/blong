import {validation, type IModelSpec} from '@feasibleone/blong';

export default validation(
    async ({lib: {type, mergeWithSymbols}, config: {mock}, handler, schema}) => {
        const result = {
            'subject.object.schema': () => ({
                params: type.Object({
                    subject: type.String(),
                    object: type.Optional(type.String()),
                }),
                result: type.Unknown(),
            }),
        };
        if (!mock) return result;
        const {validation} = await import('@feasibleone/blong-mock');
        return {
            ...result,
            ...validation(
                (
                    (await Promise.all(
                        Object.entries(mock).map(([handlerName, handlerConfig]) => {
                            if (!handlerConfig) return;
                            return handler[handlerName]({}, {});
                        }),
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
    },
);
