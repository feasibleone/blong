import { handler } from '../../../../types.js';

export default handler<{openApi: object, namespace: string[]}>(async function({
    lib: {
        errors,
        load
    }
}) {
    let handlers;
    return {
        async ready() {
            Object.keys({...this.config.openApi}).filter(Boolean).forEach(namespace => {
                if (![].concat(this.config.namespace).find(n => namespace.startsWith(n))) {
                    throw errors['openapi.namespaceNotDefined']({params: {namespace: namespace.split('.')[0]}});
                }
            });
            handlers = await load(this.config.openApi, /./);
        },
        send(params, $meta) {
            const handler = handlers?.[$meta.method];
            return handler ? handler.call(this, params, $meta) : params;
        },
        receive(response) {
            return response.body;
        }
    };
});
