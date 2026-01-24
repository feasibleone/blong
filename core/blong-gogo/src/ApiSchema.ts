import type {
    GatewaySchema,
    IApiSchema,
    ILog,
    PathItemObject,
    SchemaObject,
} from '@feasibleone/blong';
import {Internal} from '@feasibleone/blong';
import {createReadStream, statSync, writeFileSync, type Dirent} from 'node:fs';
import path, {basename, extname} from 'node:path';

import {identifier} from './lib.js';
import loadApi from './loadApi.js';

interface IConfig {
    logLevel?: Parameters<ILog['logger']>[0];
    generate?: boolean;
}

export default class ApiSchema extends Internal implements IApiSchema {
    #config: IConfig = {
        logLevel: 'debug',
        generate: true,
    };

    #loaded: Record<string, GatewaySchema> = {};
    #generateFile: Set<string> = new Set();
    #generateDir: Record<
        string,
        {
            dir: string;
            existing: Set<string>;
        }
    > = {};

    public constructor(config: IConfig, {log}: {log: ILog}) {
        super({log});
        this.merge(this.#config, config);
    }

    public method(operation: {operationId?: string}): string {
        return operation?.['x-blong-method'] || operation.operationId;
    }

    public async schema(
        def: {
            namespace: Record<string, string | string[]>;
        },
        source: string,
    ): Promise<Record<string, GatewaySchema>> {
        const result: Record<string, GatewaySchema> = {};

        for (const [name, locations] of Object.entries(def.namespace)) {
            const bundle = await loadApi(locations, source);
            const {namespace = name, destination} = bundle['x-blong'] ?? {};
            Object.entries(bundle.paths).forEach(([path, methods]: [string, PathItemObject]) => {
                ['get', 'post', 'put', 'delete'].forEach(
                    (httpMethod: 'get' | 'post' | 'put' | 'delete') => {
                        const operation = methods[httpMethod];
                        if (!operation) return;
                        const bodyParam = (
                            operation.parameters as {in?: string; schema: unknown}[]
                        )?.find?.(param => param?.in === 'body')?.schema;
                        const method = this.method(operation);
                        this.#loaded[`${namespace}${method}`.toLowerCase()] = result[
                            `${namespace}.${method}`.toLowerCase()
                        ] = {
                            rpc: false,
                            auth: false,
                            ...(bodyParam && {
                                body: bodyParam,
                            }),
                            ...('requestBody' in operation && {
                                body:
                                    'openapi' in bundle
                                        ? 'content' in operation.requestBody &&
                                          operation.requestBody.content?.['application/json']
                                        : operation.requestBody,
                            }),
                            basePath: `/rest/${namespace}`,
                            response: (operation.responses?.['200'] as {content: unknown})
                                ?.content?.['application/json']?.schema,
                            description: operation.description,
                            summary: operation.summary,
                            destination,
                            method: httpMethod.toUpperCase() as Uppercase<typeof httpMethod>,
                            subject: namespace,
                            operation,
                            path: path.replaceAll('{', ':').replaceAll('}', ''),
                        };
                    },
                );
            });
        }
        const generate = [];
        for (const [prefix, record] of Object.entries(this.#generateDir)) {
            for (const [method, operation] of Object.entries(this.#loaded)) {
                const filename = operation.subject + this.method(operation.operation) + '.ts';
                if (method.startsWith(prefix) && !record.existing.has(filename.toLowerCase())) {
                    generate.push(path.join(record.dir, filename));
                }
            }
        }
        for (const filename of generate.concat(Array.from(this.#generateFile))) {
            const method = basename(filename, extname(filename));
            const schema = this.#loaded[method.toLowerCase()];
            if (schema) {
                // console.log(schema.operation.responses);
                this.log?.warn?.(`Writing ${filename}`);
                writeFileSync(
                    filename,
                    `import unchanged from '@feasibleone/blong';
import {IMeta, handler} from '@feasibleone/blong';

// #region API
type Handler = (params: {
${this._params(schema)}
}) => Promise<{
${this._response(schema)}
}>;
// #endregion

export default handler(
    () =>
        async function ${method}(
            params: Parameters<Handler>[0],
            $meta: IMeta
        ): ReturnType<Handler> {
            return {};
        }
);
`,
                );
            }
        }
        return result;
    }

    private _params(schema: GatewaySchema): string {
        return schema?.operation?.parameters
            ?.map((param: (typeof schema.operation.parameters)[0]) => {
                if ('$ref' in param) return '';
                if (!('in' in param)) return;
                switch (param.in) {
                    case 'header':
                    case 'path':
                    case 'query':
                        return `    ${identifier(param.name)}${
                            param.required ? ':' : '?:'
                        } ${this._paramType(param)};${
                            param.description
                                ? ` // ${param.description.replaceAll(/[\r\n]/g, '')}`
                                : ''
                        }`;
                    case 'body':
                        if (param.schema?.type === 'object') {
                            return Object.entries(param.schema.properties)
                                .map(
                                    ([name, property]: [string, {description?: string}]) =>
                                        `    ${name}${param.required ? ':' : '?:'} ${this._type(
                                            property,
                                        )};${
                                            property.description
                                                ? ` // ${property.description.replaceAll(
                                                      /[\r\n]/g,
                                                      '',
                                                  )}`
                                                : ''
                                        }`,
                                )
                                .join('\n');
                        }
                }
            })
            .filter(Boolean)
            .join('\n');
    }

    private _response({operation}: GatewaySchema): string {
        if (!operation?.responses || !(200 in operation.responses)) return '';
        if (!('schema' in operation.responses[200])) return '';
        const schema = operation.responses?.[200]?.schema;
        if (!schema || !('properties' in schema)) return '';
        return Object.entries(schema.properties ?? {})
            .map(([name, property]) => {
                return `    ${name}: ${this._type(property)},`;
            })
            .join('\n');
    }

    private _paramType(param: {}): string {
        if (!('type' in param)) return 'unknown';
        switch (param.type) {
            case 'string':
                return 'string';
            case 'integer':
                return 'number';
            case 'boolean':
                return 'boolean';
            default:
                return 'unknown';
        }
    }

    private _type(schema: SchemaObject): string {
        switch (schema.type) {
            case 'string':
                return 'string';
            case 'integer':
                return 'number';
            case 'boolean':
                return 'boolean';
            case 'array':
                return `${this._type(schema.items)}[]`;
            case 'object':
                return `{${Object.entries(schema.properties)
                    .map(([name, property]) => `${name}: ${this._type(property)}`)
                    .join('; ')}}`;
        }
    }

    public async generateFile(filename: string): Promise<boolean> {
        if (this.#config.generate === false) return false;
        if (statSync(filename).size !== 0) return false;
        let content = '';
        await new Promise<void>((resolve, reject) => {
            createReadStream(filename, {end: 50, encoding: 'utf-8'})
                .on('data', chunk => {
                    content += chunk;
                })
                .on('error', reject)
                .on('close', resolve);
        });
        if (content.includes('import unchanged from')) {
            this.#generateFile.add(filename);
            return false;
        }

        this.#generateFile.add(filename);
        return true;
    }

    public async generateDir(dir: string, files: Dirent[]): Promise<boolean> {
        if (this.#config.generate === false) return false;
        const [object, orchestrator, subject] = dir.split('/').reverse();
        if (orchestrator !== 'orchestrator') return false;
        this.log?.info?.(`Generating dir ${dir}`);
        const prefix = subject.toLowerCase() + object.toLowerCase();
        let record = this.#generateDir[prefix];
        if (!record) {
            record = this.#generateDir[prefix] = {
                dir,
                existing: new Set(),
            };
        }
        files.forEach(file => record.existing.add(basename(file.name).toLowerCase()));
    }
}
