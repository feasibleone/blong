import {validation} from '@feasibleone/blong';

export default validation(async ({lib: {type}, config: {mock}, handler}) => {
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
            (await Promise.all(
                Object.entries(mock).map(([handlerName, handlerConfig]) => {
                    if (!handlerConfig) return;
                    return handler[handlerName]({}, {});
                }),
            )) as Parameters<typeof validation>[0],
        ),
    };
});
