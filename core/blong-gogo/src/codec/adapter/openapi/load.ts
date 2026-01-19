import {library} from '@feasibleone/blong';

import loadApi from '../../../loadApi.js';

const httpVerbs: string[] = ['post', 'put', 'patch', 'get', 'delete', 'options', 'head', 'trace'];

export default library(
    ({lib: {request}}) =>
        async function load(config: object, pattern: RegExp | string, source: string) {
            const test =
                pattern instanceof RegExp ? key => pattern.test(key) : key => key.includes(pattern);
            const handlers = {};
            for (const [namespace, locations] of Object.entries(config)) {
                const bundle = await loadApi(locations, source);
                Object.entries(bundle.paths).forEach(
                    ([path, methods]: [string, typeof bundle.paths.foo]) =>
                        Object.entries(methods)
                            .filter(
                                ([method, def]: [keyof typeof methods, typeof methods.get]) =>
                                    (def.operationId || def['x-blong-method']) &&
                                    httpVerbs.includes(method),
                            )
                            .forEach(
                                ([method, def]: [keyof typeof methods, typeof methods.get]) => {
                                    const name = `${namespace}${
                                        def['x-blong-method'] || def.operationId
                                    }`.toLowerCase();
                                    if (!test(name)) return;
                                    const formatProps = {
                                        method,
                                        url: '',
                                        requestBody: undefined,
                                        schemas: []
                                            .concat(methods.parameters)
                                            .concat(def.parameters)
                                            .concat(
                                                'requestBody' in def &&
                                                    def.requestBody &&
                                                    'content' in def.requestBody &&
                                                    def.requestBody.content?.['application/json']
                                                        ?.schema && {
                                                        name: 'body',
                                                        in: 'body',
                                                        schema: def.requestBody.content[
                                                            'application/json'
                                                        ].schema,
                                                    },
                                            )
                                            .filter(Boolean),
                                    };
                                    switch (true) {
                                        case 'swagger' in bundle: {
                                            formatProps.url += [
                                                (bundle.schemes && bundle.schemes[0]) || 'http',
                                                '://',
                                                bundle.host,
                                                bundle.basePath,
                                                path,
                                            ]
                                                .filter(Boolean)
                                                .join('');
                                            break;
                                        }
                                        case 'openapi' in bundle: {
                                            const defUrl =
                                                ('servers' in def &&
                                                    def.servers &&
                                                    def.servers[0] &&
                                                    def.servers[0].url) ||
                                                '';
                                            const docUrl =
                                                (bundle.servers &&
                                                    bundle.servers[0] &&
                                                    bundle.servers[0].url) ||
                                                '';
                                            formatProps.url =
                                                (defUrl.startsWith('/')
                                                    ? docUrl + defUrl
                                                    : defUrl || docUrl) + path;
                                            if ('requestBody' in def)
                                                formatProps.requestBody = def.requestBody;
                                            break;
                                        }
                                    }
                                    handlers[name] = request(formatProps);
                                },
                            ),
                );
            }
            return handlers;
        },
);
