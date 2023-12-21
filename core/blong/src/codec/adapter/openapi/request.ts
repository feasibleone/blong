import interpolate from 'ut-function.interpolate';

import { library } from '../../../../types.js';

export default library(proxy => function request({url, method, schemas}) {
    return (msg = {body: undefined, baseUrl: '', params: {}}) => {
        const {params = msg, body, baseUrl} = msg;
        const result = {
            url: baseUrl ? baseUrl + url : url,
            method,
            body,
            responseType: 'json',
            headers: undefined,
            form: undefined,
            query: undefined
        };
        schemas.forEach(schema => {
            const param = typeof params[schema.name] === 'undefined' ? schema.default : params[schema.name];
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
});
