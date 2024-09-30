import {library} from '@feasibleone/blong';
import {type OpenAPIV2} from 'openapi-types';
import interpolate from 'ut-function.interpolate';

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
                };
                schemas.forEach(schema => {
                    const param =
                        typeof params[schema.name] === 'undefined'
                            ? schema.default
                            : params[schema.name];
                    switch (schema.in) {
                        case 'header':
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
                        default:
                            break;
                    }
                });
                return result;
            };
        }
);
