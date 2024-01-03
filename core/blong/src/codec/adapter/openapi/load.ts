import parser from '@apidevtools/swagger-parser';
import got from 'got';
import { resolve } from 'node:path';

import { library } from '../../../../types.js';

const httpVerbs = ['post', 'put', 'patch', 'get', 'delete', 'options', 'head', 'trace'];

export default library(({
    lib: {
        request,
        merge
    }
}) => async function load(config, pattern) {
    const test = pattern instanceof RegExp ? key => pattern.test(key) : key => key.includes(pattern);
    const handlers = {};
    for (const [ns, locations] of Object.entries(config)) {
        const documents = [];
        for (const location of [].concat(locations)) {
            if (typeof location === 'object') documents.push(location);
            else if (typeof location === 'string') {
                if (location.startsWith('http')) documents.push(await got(location, {responseType: 'json'}).json());
                else documents.push((await import(resolve(location), {assert: { type: "json" }})).default);
            }
        }
        const bundle = await parser.bundle(merge(...documents));
        Object.entries(bundle.paths).forEach(([path, methods]: [string, typeof bundle.paths.foo]) =>
            Object.entries(methods)
                .filter(([method, def]: [keyof typeof methods, typeof methods.get]) => def.operationId && httpVerbs.includes(method))
                .forEach(([method, def] : [keyof typeof methods, typeof methods.get]) => {
                    const name = `${ns}.${def.operationId}`;
                    if (!test(name)) return;
                    const formatProps = {
                        method,
                        url: '',
                        requestBody: undefined,
                        schemas: [].concat(methods.parameters).concat(def.parameters).filter(Boolean)
                    };
                    switch (true) {
                        case 'swagger' in bundle: {
                            formatProps.url += [
                                (bundle.schemes && bundle.schemes[0]) || 'http',
                                '://',
                                bundle.host,
                                bundle.basePath,
                                path
                            ].filter(Boolean).join('');
                            break;
                        }
                        case 'openapi' in bundle: {
                            const defUrl = ('servers' in def && (def.servers && def.servers[0] && def.servers[0].url)) || '';
                            const docUrl = (bundle.servers && bundle.servers[0] && bundle.servers[0].url) || '';
                            formatProps.url = (defUrl.startsWith('/') ? (docUrl + defUrl) : (defUrl || docUrl)) + path;
                            if ('requestBody' in def) formatProps.requestBody = def.requestBody;
                            break;
                        }
                    }
                    handlers[name] = request(formatProps);
                })
        );
    }
    return handlers;
});
