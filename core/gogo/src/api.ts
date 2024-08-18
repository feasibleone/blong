import parser from '@apidevtools/swagger-parser';
import {type GatewaySchema} from '@feasibleone/blong';
import got from 'got';
import {resolve} from 'node:path';
import merge from 'ut-function.merge';

export async function loadApi(
    locations: string | string[] | object | object[]
): ReturnType<typeof parser.dereference> {
    const documents = [];
    for (const location of [].concat(locations)) {
        if (typeof location === 'object') documents.push(location);
        else if (typeof location === 'string') {
            if (location.startsWith('http'))
                documents.push(await got(location, {responseType: 'json'}).json());
            else
                documents.push((await import(resolve(location), {assert: {type: 'json'}})).default);
        }
    }
    return await parser.dereference(merge(...documents));
}

export async function apiSchema(def: {
    namespace: Record<string, string | string[]>;
}): Promise<Record<string, GatewaySchema>> {
    const result = {};

    for (const [namespace, locations] of Object.entries(def.namespace)) {
        const bundle = await loadApi(locations);
        Object.entries(bundle.paths).forEach(
            ([path, methods]: [string, typeof bundle.paths.foo]) => {
                Object.entries(methods).forEach(([method, def]) => {
                    if (def.operationId) {
                        result[`${namespace}.${def.operationId}`.toLowerCase()] = {
                            rpc: false,
                            auth: false,
                            ...(def.requestBody && {body: def.requestBody}),
                            basePath: '/rest',
                            response: def.responses?.['200']?.content?.['application/json']?.schema,
                            description: def.description,
                            summary: def.summary,
                            method: method.toUpperCase(),
                            path: path.replaceAll('{', ':').replaceAll('}', ''),
                        };
                    }
                });
            }
        );
    }
    return result;
}
