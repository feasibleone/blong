import type {ApiSchema, GatewaySchema} from '@feasibleone/blong/types';
import type {FastifyRequest} from 'fastify';

import {snakeToCamel} from './lib.ts';

export function operationParams(
    operation: GatewaySchema['operation'],
    bodySchema: ApiSchema,
    request: FastifyRequest,
): unknown {
    const result =
        operation?.parameters?.reduce((result, parameter) => {
            if ('in' in parameter && 'name' in parameter) {
                let where;
                switch (parameter.in) {
                    case 'header':
                        where = request.headers;
                        break;
                    case 'query':
                        where = request.query;
                        break;
                    case 'path':
                        where = request.params;
                        break;
                    case 'cookie':
                        where = request.cookies;
                        break;
                    case 'body':
                        if (request.body) {
                            if (parameter.schema?.additionalProperties)
                                Object.assign(result, request.body);
                            else if (parameter.schema?.properties)
                                Object.entries(parameter.schema.properties).forEach(
                                    ([name, value]) => {
                                        if (name in (request.body as {}))
                                            result[snakeToCamel(name)] = request.body[name];
                                    },
                                );
                        }
                        break;
                }
                if (where && parameter.name in where)
                    result[snakeToCamel(parameter.name)] = where[parameter.name];
            }
            return result;
        }, {}) ?? {};
    if (
        bodySchema &&
        'type' in bodySchema &&
        bodySchema?.type === 'object' &&
        (bodySchema.properties ||
            ('additionalProperties' in bodySchema && bodySchema?.additionalProperties))
    ) {
        if ('additionalProperties' in bodySchema && bodySchema.additionalProperties)
            Object.assign(result, request.body);
        else if (bodySchema.properties)
            Object.entries(bodySchema.properties).forEach(([name, value]) => {
                if (name in (request.body as {})) result[snakeToCamel(name)] = request.body[name];
            });
    }
    return result;
}
