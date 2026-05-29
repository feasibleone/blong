import {validation} from '@feasibleone/blong';

export default validation(async ({config: {mock}, handler}) => {
    if (!mock) return {};
    const {validation} = await import('@feasibleone/blong-mock');
    return validation(
        (await Promise.all(
            Object.entries(mock).map(([handlerName, handlerConfig]) => {
                if (!handlerConfig) return;
                return handler[handlerName]({}, {});
            }),
        )) as Parameters<typeof validation>[0],
    );
});
