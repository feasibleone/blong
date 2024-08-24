import {handler, type IMeta} from '@feasibleone/blong';

import {methodId} from '../../../lib.js';

export default handler(async ({config, lib: {load}, errors}) => {
    let handlers;
    return {
        async ready() {
            Object.keys(config.namespace)
                .filter(Boolean)
                .forEach(namespace => {
                    if (![].concat(this.config.namespace).find(n => namespace.startsWith(n))) {
                        throw errors.openapiNamespaceNotDefined({
                            params: {namespace: namespace.split('.')[0]},
                        });
                    }
                });
            handlers = await load(config.namespace, /./);
        },
        send(params: unknown, $meta: IMeta) {
            const handler = handlers?.[methodId($meta.method)];
            return handler ? handler.call(this, params, $meta) : params;
        },
        receive(response: {body: unknown}) {
            return response.body;
        },
    };
});
