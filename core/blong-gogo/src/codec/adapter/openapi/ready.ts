import {handler, type IMeta} from '@feasibleone/blong/types';

import {methodId} from '../../../lib.ts';

export default handler<{
    namespace: {[namespace: string]: unknown};
}>(async ({config, lib: {load}, errors}) => {
    let handlers: {[name: string]: unknown};
    const assets: {[namespace: string]: unknown} = {};
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
            for (const [key, value] of Object.entries(config.namespace))
                assets[key] = await this.link(`${value}.asset`);
            handlers = await load(assets, /./, this.configBase);
        },
        requestSend(params: unknown, $meta: IMeta) {
            const handler = handlers?.[methodId($meta.method)];
            return handler ? handler.call(this, params, $meta) : params;
        },
        responseReceive(response: {body: unknown}) {
            return response.body;
        },
    };
});
