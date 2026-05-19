import {library} from '@feasibleone/blong/types';
import {type OpenAPIV2} from 'openapi-types';
import interpolate from 'ut-function.interpolate';

import {snakeToCamel} from '../../../lib.ts';

export default library(
    () =>
        function request({
            url,
            method,
            schemas,
            path,
            responseType,
        }: {
            url: string;
            method: string;
            schemas: OpenAPIV2.ParameterObject[];
            path: string;
            responseType: string;
        }) {
            return (
                msg: {
                    body?: unknown;
                    baseUrl?: string;
                    params?: Record<string, unknown>;
                    payload?: unknown;
                    headers?: Record<string, unknown>;
                    responseType?: string;
                } = {},
            ) => {
                const {params = msg, body, baseUrl, headers, payload} = msg;
                const result: {
                    url: string;
                    method: string;
                    body: unknown;
                    responseType: string | undefined;
                    headers: Record<string, unknown> | undefined;
                    form: Record<string, unknown> | undefined;
                    query: Record<string, unknown> | undefined;
                    json: unknown;
                } = {
                    url: baseUrl ? baseUrl + path : url,
                    method,
                    body,
                    responseType: msg.responseType || responseType,
                    headers: headers as Record<string, unknown> | undefined,
                    form: undefined,
                    query: undefined,
                    json: undefined,
                };
                schemas.forEach(schema => {
                    const identifier = snakeToCamel(schema.name);
                    const param =
                        typeof (params as Record<string, unknown>)[identifier] === 'undefined'
                            ? schema.default
                            : (params as Record<string, unknown>)[identifier];
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
                            if (schema.schema?.properties || schema.schema?.additionalProperties)
                                result.json = schema.schema.additionalProperties
                                    ? payload
                                    : Object.fromEntries(
                                          Object.entries(
                                              schema.schema.properties as Record<
                                                  string,
                                                  {default?: unknown}
                                              >,
                                          )
                                              .map(
                                                  ([name, value]) =>
                                                      name in params && [
                                                          name,
                                                          typeof (
                                                              params as Record<string, unknown>
                                                          )[name] === 'undefined'
                                                              ? value.default
                                                              : (params as Record<string, unknown>)[
                                                                    name
                                                                ],
                                                      ],
                                              )
                                              .filter(Boolean) as [string, unknown][],
                                      );
                            break;
                        default:
                            break;
                    }
                });
                return result;
            };
        },
);
