import {library} from '@feasibleone/blong/types';

const httpVerbs: string[] = ['post', 'put', 'patch', 'get', 'delete', 'options', 'head', 'trace'];
const responseTypes: Record<string, string> = {
    'application/json': 'json',
    'text/plain': 'text',
    'text/html': 'text',
};

type BundleOperation = {
    operationId?: string;
    'x-blong-method'?: string;
    parameters?: unknown[];
    requestBody?: {content?: Record<string, {schema?: unknown}>};
    responses?: Record<string, {content?: Record<string, {schema?: unknown}>}>;
    servers?: {url: string}[];
};
type BundleDoc = {
    paths?: Record<string, Record<string, BundleOperation>>;
    parameters?: unknown[];
    swagger?: string;
    schemes?: string[];
    host?: string;
    basePath?: string;
    openapi?: string;
    servers?: {url: string}[];
};

export default library(
    ({lib: {request}, apiSchema}) =>
        async function load(config: object, pattern: RegExp | string, source: string) {
            const test =
                pattern instanceof RegExp
                    ? (key: string) => pattern.test(key)
                    : (key: string) => key.includes(pattern as string);
            const handlers: Record<string, unknown> = {};
            for (const [namespace, locations] of Object.entries(config)) {
                const bundle = (await apiSchema.loadApi(locations, source)) as BundleDoc;
                Object.entries(bundle.paths ?? {}).forEach(([path, methods]) =>
                    Object.entries(methods)
                        .filter(
                            ([method, def]) =>
                                (def.operationId || def['x-blong-method']) &&
                                httpVerbs.includes(method),
                        )
                        .forEach(([method, def]) => {
                            const name = `${namespace}${
                                def['x-blong-method'] || def.operationId
                            }`.toLowerCase();
                            if (!test(name)) return;
                            const formatProps: {
                                method: string;
                                path: string;
                                url: string;
                                requestBody: unknown;
                                responseType: string | undefined;
                                schemas: unknown[];
                            } = {
                                method,
                                path,
                                url: '',
                                requestBody: undefined,
                                responseType: undefined,
                                schemas: ([] as unknown[])
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
                                                schema: def.requestBody.content['application/json']
                                                    .schema,
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
                            // get unique response types
                            const responseTypeSet = new Set<string>();
                            Object.values(def.responses || {}).forEach(response => {
                                if (response.content) {
                                    Object.entries(response.content).forEach(
                                        ([type, content]) =>
                                            (content as {schema?: unknown}).schema &&
                                            responseTypes[type] &&
                                            responseTypeSet.add(responseTypes[type]),
                                    );
                                }
                            });
                            if (responseTypeSet.size === 1)
                                formatProps.responseType = responseTypeSet.values().next().value;
                            else formatProps.responseType = 'json';
                            handlers[name] = request(formatProps);
                        }),
                );
            }
            return handlers;
        },
);
