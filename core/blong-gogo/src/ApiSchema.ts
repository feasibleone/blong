import type {GatewaySchema, ILog, PathItemObject, SchemaObject} from '@feasibleone/blong';
import {Internal} from '@feasibleone/blong';
import {createReadStream, statSync, writeFileSync, type Dirent} from 'node:fs';
import path, {basename, extname} from 'node:path';

import loadApi from './loadApi.js';

interface IConfig {
    logLevel?: Parameters<ILog['logger']>[0];
    generate?: boolean;
}

export interface IApiSchema {
    schema(
        def: {namespace: Record<string, string | string[]>},
        source: string
    ): Promise<Record<string, GatewaySchema>>;
    generateFile(file: string): Promise<boolean>;
    generateDir(dir: string, files: Dirent[]): Promise<boolean>;
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

    public async schema(
        def: {
            namespace: Record<string, string | string[]>;
        },
        source: string
    ): Promise<Record<string, GatewaySchema>> {
        const result: Record<string, GatewaySchema> = {};

        for (const [namespace, locations] of Object.entries(def.namespace)) {
            const bundle = await loadApi(locations, source);
            Object.entries(bundle.paths).forEach(([path, methods]: [string, PathItemObject]) => {
                ['get', 'post', 'put', 'delete'].forEach(
                    (method: 'get' | 'post' | 'put' | 'delete') => {
                        const operation = methods[method];
                        if (!operation) return;
                        this.#loaded[`${namespace}${operation.operationId}`.toLowerCase()] = result[
                            `${namespace}.${operation.operationId}`.toLowerCase()
                        ] = {
                            rpc: false,
                            auth: false,
                            ...(operation.requestBody && {body: operation.requestBody}),
                            basePath: '/rest',
                            response:
                                operation.responses?.['200']?.content?.['application/json']?.schema,
                            description: methods.description,
                            summary: methods.summary,
                            method: method.toUpperCase() as Uppercase<typeof method>,
                            subject: namespace,
                            operation,
                            path: path.replaceAll('{', ':').replaceAll('}', ''),
                        };
                    }
                );
            });
        }
        const generate = [];
        for (const [prefix, record] of Object.entries(this.#generateDir)) {
            for (const [operationId, operation] of Object.entries(this.#loaded)) {
                const filename = operation.subject + operation.operation.operationId + '.ts';
                if (
                    operationId.startsWith(prefix) &&
                    !record.existing.has(filename.toLowerCase())
                ) {
                    generate.push(path.join(record.dir, filename));
                }
            }
        }
        for (const filename of generate.concat(Array.from(this.#generateFile))) {
            // #region
            const operationId = basename(filename, extname(filename));
            const schema = this.#loaded[operationId.toLowerCase()];
            // #endregion
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
        async function ${operationId}(
            params: Parameters<Handler>[0],
            $meta: IMeta
        ): ReturnType<Handler> {
            return {};
        }
);
`
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
                    case 'path':
                        return `    ${param.name}: string`;
                    case 'query':
                        return `    ${param.name}: string`;
                    case 'body':
                        if (param.schema?.type === 'object') {
                            return Object.entries(param.schema.properties)
                                .map(([name, property]) => `    ${name}: ${this._type(property)}`)
                                .join(',\n');
                        }
                }
            })
            .filter(Boolean)
            .join(',\n');
    }

    private _response({operation}: GatewaySchema): string {
        if (!operation || !(200 in operation.responses)) return '';
        if (!('schema' in operation.responses[200])) return '';
        const schema = operation.responses?.[200]?.schema;
        if (!schema || !('properties' in schema)) return '';
        return Object.entries(schema.properties ?? {})
            .map(([name, property]) => {
                return `    ${name}: ${this._type(property)},`;
            })
            .join('\n');
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
                return `{${Object.entries(schema.properties).map(
                    ([name, property]) => `${name}: ${this._type(property)}`
                )}}`;
        }
    }

    public async generateFile(filename: string): Promise<boolean> {
        if (this.#config.generate === false) return false;
        if (statSync(filename).size !== 0) return false;
        let content = '';
        await new Promise((resolve, reject) => {
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
