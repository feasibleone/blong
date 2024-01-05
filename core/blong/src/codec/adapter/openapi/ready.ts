import {handler, type IMeta} from '../../../../types.js';

export default handler(async ({lib: {errors, load}}) => {
    let handlers;
    return {
        async ready() {
            Object.keys({...this.config.openApi})
                .filter(Boolean)
                .forEach(namespace => {
                    if (![].concat(this.config.namespace).find(n => namespace.startsWith(n))) {
                        throw errors['openapi.namespaceNotDefined']({
                            params: {namespace: namespace.split('.')[0]},
                        });
                    }
                });
            handlers = await load(this.config.openApi, /./);
        },
        send(params: unknown, $meta: IMeta) {
            const handler = handlers?.[$meta.method];
            return handler ? handler.call(this, params, $meta) : params;
        },
        receive(response: {body: unknown}) {
            return response.body;
        },
    };
});
