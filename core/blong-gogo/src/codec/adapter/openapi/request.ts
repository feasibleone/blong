import {library} from '@feasibleone/blong';
import {type OpenAPIV2} from 'openapi-types';
import interpolate from 'ut-function.interpolate';

import {snakeToCamel} from '../../../lib.js';

export default library(
    proxy =>
        function request({
            url,
            method,
            schemas,
        }: {
            url: string;
            method: string;
            schemas: OpenAPIV2.ParameterObject[];
        }) {
            return (msg = {body: undefined, baseUrl: '', params: {}, headers: undefined}) => {
                const {params = msg, body, baseUrl, headers} = msg;
                const result = {
                    url: baseUrl ? baseUrl + url : url,
                    method,
                    body,
                    responseType: 'json',
                    headers,
                    form: undefined,
                    query: undefined,
                    json: undefined,
                };
                schemas.forEach(schema => {
                    const identifier = snakeToCamel(schema.name);
                    const param =
                        typeof params[identifier] === 'undefined'
                            ? schema.default
                            : params[identifier];
                    switch (schema.in) {
                        case 'header':
                            if (schema.name.toLocaleLowerCase() === 'content-length') return;
                            result.headers ||= {};
                            result.headers[schema.name] = param;
                            break;
                        case 'query':
                            result.query ||= {};
                            result.query[schema.name] = param;
                            break;
                        case 'formData':
                            result.form ||= {};
                            result.form[schema.name] = param;
                            break;
                        case 'path':
                            result.url = interpolate(result.url, {[schema.name]: param});
                            break;
                        case 'body':
                            if (schema.schema?.properties)
                                result.json = Object.fromEntries(
                                    Object.entries(schema.schema.properties)
                                        .map(
                                            ([name, value]: [string, {default: unknown}]) =>
                                                name in params && [
                                                    name,
                                                    typeof params[name] === 'undefined'
                                                        ? value.default
                                                        : params[name],
                                                ]
                                        )
                                        .filter(Boolean)
                                );
                            break;
                        default:
                            break;
                    }
                });
                return result;
            };
        }
);
