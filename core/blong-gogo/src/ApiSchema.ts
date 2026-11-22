import type {
    ApiSchema as ApiSchemaType,
    GatewaySchema,
    IApiSchema,
    ILog,
    IPlatformApi,
    PathItemObject,
    SchemaObject,
} from '@feasibleone/blong/types';
import {Internal} from '@feasibleone/blong/types';
import {type Dirent} from 'node:fs';

import {identifier} from './lib.ts';
import loadApi from './loadApi.ts';

interface IConfig {
    logLevel?: Parameters<ILog['logger']>[0];
    generate?: boolean;
}

/**
 * The line that says a file is still generated, and the only thing the generator reads to decide.
 *
 * It is the marker `blong-kukum` writes as well, and the file-level `eslint-disable` in the stub keeps
 * the unused import legal. While it is there the file is a stub: the next pass rewrites it from the
 * definition, because nothing in it says anything the definition does not. A developer who fills the
 * body in deletes the line, and from then on the file is theirs (`@@D-965`).
 *
 * The one way it goes away by accident is an editor that removes unused imports on save. That is
 * why `generate:check` exists: while the file is still a stub, a marker that vanished is a difference
 * from what generation produces, and the check says so before the stub is silently frozen.
 */
const GENERATED_MARKER = "import unchanged from '@feasibleone/blong';";

export default class ApiSchema extends Internal implements IApiSchema {
    #config: IConfig = {
        logLevel: 'debug',
        // Off unless an intent turns it on: this writes into the source tree, which only an interactive
        // run should do. `dev` is where it is on (see the synthetic config in `load.ts`); a realm may
        // also ask for it by name in its own block (@@D-963).
        generate: false,
    };
    #platform: IPlatformApi;

    #loaded: Record<string, GatewaySchema> = {};
    #namespace: Record<string, Record<string, GatewaySchema>> = {};
    #generateFile: Set<string> = new Set();
    /** The loaded methods already reported as having no folder to go in, so a reload repeats nothing. */
    #reportedUnplaced: Set<string> = new Set();
    /**
     * The orchestrator folders a scan found, by folder, with what is already in each.
     *
     * Keyed by the folder rather than by a prefix: two folders can produce one prefix (a realm and a
     * group named the same), and keying by the prefix made the second folder's files count as the
     * first folder's, so a stub was written into the wrong group or not at all.
     *
     * `realm` and `object` are the two halves of the pairing: the folder belongs to one realm — the one
     * whose `server/api/` declared the namespace — and takes the operations whose id begins with its own
     * name. The namespace is *not* part of the test, so a realm may serve several of them (`@@D-964`).
     */
    #generateDir: Map<
        string,
        {
            /** The realm folder the group belongs to, e.g. `orders`. */
            realm: string;
            /** The group folder's own name, lowercased — what an operation id has to begin with. */
            object: string;
            /** The code files the folder already holds, lowercased — a file here is never generated. */
            existing: Set<string>;
        }
    > = new Map();

    public constructor(config: IConfig, {log, platform}: {log: ILog; platform: IPlatformApi}) {
        super({log});
        this.#platform = platform;
        this.merge(this.#config, config);
    }

    public method(operation: {
        operationId?: string;
        'x-blong-method'?: string;
    }): string | undefined {
        return operation?.['x-blong-method'] || operation.operationId;
    }

    public loadApi(
        locations: string | string[] | object | object[] | {assets: object},
        source: string = process.cwd(),
    ): ReturnType<typeof loadApi> {
        return loadApi(locations, source, this.#platform);
    }

    public async schema(
        {
            namespace,
            url,
        }: {
            namespace?: Record<string, string | string[]> | string[];
            url?: string;
        },
        source: string,
    ): Promise<Record<string, GatewaySchema>> {
        const result: Record<string, GatewaySchema> = {};
        // The operations this call loaded. The pass below is about the documents in hand: reporting an
        // operation another realm's layer loaded — and placed — as unplaced is a warning nobody can act on.
        const own = new Set<string>();
        if (url) {
            const dir = this.#platform.dirname(url.startsWith('file://') ? url.slice(7) : url);
            const files = await this.#platform.scan(dir);
            namespace = namespace || {};
            for (const file of files) {
                if (
                    file.isFile() &&
                    (file.name.endsWith('.yaml') ||
                        file.name.endsWith('.yml') ||
                        file.name.endsWith('.json'))
                ) {
                    const [name] = this.#platform.basename(file.name).split('.');
                    (namespace as Record<string, string[]>)[name] ||= [];
                    (namespace as Record<string, string[]>)[name].push(
                        this.#platform.join(dir, file.name),
                    );
                }
            }
        }
        if (Array.isArray(namespace))
            return namespace.reduce(
                (acc, name) => ({
                    ...acc,
                    ...this.#namespace[name],
                }),
                {},
            );

        if (!namespace) return result;

        for (const [name, locations] of Object.entries(namespace)) {
            const bundle = await loadApi(locations, source, this.#platform);
            const blongMeta = (bundle as Record<string, unknown>)['x-blong'] as
                | {namespace?: string; destination?: string}
                | undefined;
            const {namespace: nsName = name, destination} = blongMeta ?? {};
            this.#namespace[nsName] ||= {};
            Object.entries(bundle.paths ?? {}).forEach(
                ([path, methods]: [string, PathItemObject]) => {
                    (['get', 'post', 'put', 'delete'] as const).forEach(httpMethod => {
                        const operation = methods[httpMethod];
                        if (!operation) return;
                        const bodyParam = (
                            operation.parameters as {in?: string; schema: unknown}[]
                        )?.find?.(param => param?.in === 'body')?.schema;
                        const method = this.method(operation);
                        const definition: GatewaySchema = {
                            rpc: false,
                            auth: false,
                            ...(bodyParam ? {body: bodyParam} : {}),
                            ...('requestBody' in operation && {
                                body:
                                    'openapi' in bundle
                                        ? 'content' in (operation.requestBody ?? {}) &&
                                          (
                                              operation.requestBody as {
                                                  content?: Record<string, {schema?: unknown}>;
                                              }
                                          )?.content?.['application/json']
                                        : operation.requestBody,
                            }),
                            basePath: `/rest/${nsName}`,
                            response: (
                                (
                                    operation.responses?.['200'] as {
                                        content?: Record<string, {schema?: unknown}>;
                                    }
                                )?.content?.['application/json'] as {schema?: unknown} | undefined
                            )?.schema as ApiSchemaType | undefined,
                            description: operation.description,
                            summary: operation.summary,
                            destination,
                            method: httpMethod.toUpperCase() as Uppercase<typeof httpMethod>,
                            subject: nsName,
                            operation,
                            path: path.replaceAll('{', ':').replaceAll('}', ''),
                        };
                        this.#loaded[`${nsName}${method}`.toLowerCase()] = definition;
                        own.add(`${nsName}${method}`.toLowerCase());
                        this.#namespace[nsName][`${nsName}.${method}`.toLowerCase()] = definition;
                        result[`${nsName}.${method}`.toLowerCase()] = definition;
                    });
                },
            );
        }
        // Which loaded operations have no file yet. Nothing is written here: a folder is scanned while
        // the layers load and an API definition arrives whenever a layer happens to declare one, so this
        // pass only pairs the two that exist now.
        const generate: string[] = [];
        const placed = new Set<string>();
        const realm = this._realmOf(source);
        for (const [dir, record] of this.#generateDir) {
            for (const [key, operation] of Object.entries(this.#loaded)) {
                const namespace = operation.subject ?? '';
                // The folder belongs to the realm that declared the namespace; without a source path to
                // read that from, the older rule stands and the namespace has to name the realm.
                if (record.realm !== (realm ?? namespace)) continue;
                const operationId = this.method(operation.operation ?? {}) ?? '';
                if (!operationId.toLowerCase().startsWith(record.object)) continue;
                placed.add(key);
                const filename = `${namespace}${operationId}.ts`;
                const target = this.#platform.join(dir, filename);
                // A file that exists is written again only while nothing has been written in it: empty,
                // or still carrying the marker. The marker leaving the file is how it stops being a stub,
                // and that is a decision only the person editing it can make (`@@D-965`).
                if (record.existing.has(filename.toLowerCase()) && !this._generated(target))
                    continue;
                // Recorded as taken, so a second pass in this process — another API-bearing layer, a
                // reload — does not write the same stub twice.
                record.existing.add(filename.toLowerCase());
                generate.push(target);
            }
        }
        // An operation that matched no folder is the one case a developer cannot see on their own: the
        // definition loaded, nothing appeared, and the reason is that the operation is named for a group
        // that does not exist. Reported once per operation, since a reload repeats the pass.
        if (this.#config.generate !== false) {
            for (const key of own) {
                if (placed.has(key) || this.#reportedUnplaced.has(key)) continue;
                this.#reportedUnplaced.add(key);
                const operation = this.#loaded[key];
                this.signal?.frameworkSchemaMethodUnplaced?.({
                    method: `${operation.subject ?? ''}${this.method(operation.operation ?? {}) ?? ''}`,
                });
            }
        }
        // One write per file per pass: two documents can declare the same operation, and a placeholder
        // claimed by the watcher can be one of the candidates as well.
        for (const filename of new Set([...generate, ...this.#generateFile])) {
            const method = this.#platform.basename(filename, this.#platform.extname(filename));
            const schema = this.#loaded[method.toLowerCase()];
            this.#generateFile.delete(filename);
            if (!schema) continue;
            const content = this._stub(method, schema);
            // Writing a file that already says this bumps its mtime, and a watching runner restarts on
            // it: a pass that rewrote identical stubs would restart the process for ever, and an editor
            // would ask about a change nobody made (`@@F-817`).
            if (this._read(filename) === content) continue;
            this.signal?.frameworkSchemaFileRewritten?.({file: filename, method});
            this.#platform.writeFileSync(filename, content);
        }
        return result;
    }

    /** The stub a handler file holds, exactly as it is written to disk. */
    private _stub(method: string, schema: GatewaySchema): string {
        return `/* eslint-disable @typescript-eslint/no-unused-vars -- a generated stub has not used its arguments yet */
// Generated from the API definition of this realm. While the marker import below is here this file is
// a stub and the next run rewrites it; saving the file in an editor drops that unused import, and the
// file becomes yours.
${GENERATED_MARKER}
import {type IMeta, handler} from '@feasibleone/blong/types';

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
            $meta: IMeta,
        ): ReturnType<Handler> {
            // A stub, not a handler: the signature is the contract, the body is yours. Throwing says
            // so at the first call rather than answering a reply that was never computed.
            throw new Error('generated stub: ${method} has no body yet');
        },
);
`;
    }

    /** What a file on disk says, or `undefined` when there is no such file. */
    private _read(filename: string): string | undefined {
        try {
            return this.#platform.readFileSync(filename, {encoding: 'utf-8'}).toString('utf-8');
        } catch {
            return undefined;
        }
    }

    /**
     * Whether a file is still the generator's to write: it does not exist, is empty, or carries the
     * marker.
     *
     * Read here rather than remembered from the folder scan, because the scan sees names and this
     * question is about content — and asked only for the files a pass is about to touch, so the cost is
     * one read per candidate rather than one per file in every scanned folder (`@@D-965`).
     */
    private _generated(filename: string): boolean {
        const content = this._read(filename);
        // Not there yet: there is nothing of anyone's to lose.
        return content === undefined || content.trim() === '' || content.includes(GENERATED_MARKER);
    }

    /**
     * The stub's `params` block: the operation's parameters, then its body.
     *
     * Two spec styles reach here. OpenAPI 3 puts the body in `requestBody.content['application/json']`
     * — which `schema()` has already lifted onto `body` — while Swagger 2 puts it in a `parameters`
     * entry with `in: body`. Both are read, so a modern definition produces a typed stub and does not
     * fall back to an empty one just for being written in the newer shape (`@@D-962`).
     */
    private _params(schema: GatewaySchema): string {
        const parameters = (schema?.operation?.parameters ?? []) as {
            in?: string;
            name?: string;
            required?: boolean;
            type?: string;
            description?: string;
            schema?: SchemaObject;
        }[];
        const lines: string[] = [];
        for (const param of parameters) {
            if (!param || !('in' in param) || param.in === 'body') continue;
            if (!['header', 'path', 'query'].includes(param.in!)) continue;
            lines.push(
                `    ${identifier(param.name ?? '')}${param.required ? ':' : '?:'} ${this._paramType(
                    param,
                )};${this._comment(param.description)}`,
            );
        }
        const body = this._bodySchema(schema);
        if (body && typeof body === 'object' && (body as SchemaObject).type === 'object') {
            const required = new Set(
                ((body as {required?: string[]}).required ?? []).map(name => name),
            );
            for (const [name, property] of Object.entries(
                ((body as {properties?: Record<string, SchemaObject>}).properties ?? {}) as Record<
                    string,
                    SchemaObject
                >,
            )) {
                lines.push(
                    `    ${name}${required.has(name) ? ':' : '?:'} ${this._type(property)};${this._comment(
                        (property as {description?: string}).description,
                    )}`,
                );
            }
        } else if (body) {
            // A body that is not an object is the whole argument list: `params` is that value.
            lines.push(`    body: ${this._type(body as SchemaObject)};`);
        }
        return lines.join('\n');
    }

    /** The body schema, whichever spec style declared it. */
    private _bodySchema(schema: GatewaySchema): SchemaObject | undefined {
        const declared = (schema as {body?: unknown}).body;
        if (declared && typeof declared === 'object') {
            const media = declared as {schema?: SchemaObject};
            return media.schema ?? (declared as SchemaObject);
        }
        const parameters = (schema?.operation?.parameters ?? []) as {
            in?: string;
            schema?: SchemaObject;
        }[];
        return parameters.find(param => param?.in === 'body')?.schema;
    }

    /**
     * The stub's response block.
     *
     * `response` is what `schema()` derived from OpenAPI 3's `content['application/json'].schema`; the
     * Swagger 2 shape is read as the fallback (`@@D-962`).
     */
    private _response(schema: GatewaySchema): string {
        const declared =
            ((schema as {response?: unknown}).response as SchemaObject | undefined) ??
            (schema.operation?.responses?.['200'] as {schema?: SchemaObject} | undefined)?.schema;
        if (!declared || typeof declared !== 'object') return '';
        const properties = (declared as {properties?: Record<string, SchemaObject>}).properties;
        if (!properties) return '';
        return Object.entries(properties)
            .map(([name, property]) => `    ${name}: ${this._type(property)};`)
            .join('\n');
    }

    /** A trailing `// …` comment, collapsed onto one line — the stub is generated source. */
    private _comment(text?: string): string {
        return text ? ` // ${text.replaceAll(/[\r\n]/g, ' ')}` : '';
    }

    /**
     * A parameter's TypeScript type.
     *
     * Swagger 2 puts `type` on the parameter; OpenAPI 3 moves it into `schema`, so both are read —
     * otherwise every parameter of a modern definition became `unknown` in the stub (`@@D-962`).
     */
    private _paramType(param: {type?: string; schema?: SchemaObject}): string {
        const schema = param.schema ?? (param as SchemaObject);
        switch (schema?.type) {
            case 'string':
                return 'string';
            case 'integer':
            case 'number':
                return 'number';
            case 'boolean':
                return 'boolean';
            case 'array':
                return `${this._type((schema.items as SchemaObject) ?? {})}[]`;
            default:
                return 'unknown';
        }
    }

    /**
     * A schema as a TypeScript type.
     *
     * An object with no declared members is `Record<string, unknown>` rather than `{}`: the empty
     * braces are a type the linter refuses (`no-empty-object-type`), because they mean "anything
     * non-nullish" — and a generated stub has to pass the lint of the package it lands in
     * (`@@D-962`).
     */
    private _type(schema: SchemaObject): string {
        switch (schema.type) {
            case 'string':
                return 'string';
            case 'integer':
            case 'number':
                return 'number';
            case 'boolean':
                return 'boolean';
            case 'array':
                return `${this._type((schema.items as SchemaObject) ?? {})}[]`;
            case 'object': {
                const properties = (schema as {properties?: Record<string, unknown>}).properties;
                if (!properties || Object.keys(properties).length === 0)
                    return 'Record<string, unknown>';
                return `{${Object.entries(properties)
                    .map(([name, property]) => `${name}: ${this._type(property as SchemaObject)}`)
                    .join('; ')}}`;
            }
            default:
                return 'unknown';
        }
    }

    public async generateFile(filename: string): Promise<boolean> {
        if (this.#config.generate === false) return false;
        if (this.#platform.statSync(filename).size !== 0) return false;
        this.#generateFile.add(filename);
        return true;
    }

    /**
     * Record what an orchestrator folder already holds, for the generation pass in {@link schema}.
     *
     * Scanned folders are cheap and numerous — every handler group of every realm, again on every
     * reload — so this method writes nothing and reports nothing: it is not yet known whether any
     * loaded API method belongs here, and announcing "generating dir" for a folder that will never
     * generate a file is what flooded the log (`@@D-961`). The one line a reader gets is the file
     * actually written.
     *
     * @returns Whether the folder is one a handler can be generated into.
     */
    public async generateDir(dir: string, files: Dirent[]): Promise<boolean> {
        if (this.#config.generate === false) return false;
        // Both separators: the folder arrives as a platform path on Windows as well.
        const [object, orchestrator, subject] = dir.split(/[\\/]/).reverse();
        if (orchestrator !== 'orchestrator' || !object || !subject) return false;
        let record = this.#generateDir.get(dir);
        if (!record) {
            record = {realm: subject, object: object.toLowerCase(), existing: new Set()};
            this.#generateDir.set(dir, record);
        }
        files.forEach(file =>
            record.existing.add(this.#platform.basename(file.name).toLowerCase()),
        );
        return true;
    }

    /**
     * The realm a layer file belongs to, from its path — `<realm>/server/api/api.ts` → `<realm>`.
     *
     * This is what lets one realm serve several namespaces: the namespaces a layer declares belong to the
     * realm the layer lives in, so the folder a stub goes to is decided by the realm and the operation's
     * own object, never by the namespace's name (`@@D-964`). A path with no `server` segment — a layer
     * outside the well-known place — answers `undefined`, and the caller falls back to the older rule.
     */
    private _realmOf(source: string): string | undefined {
        const segments = source.replace(/^file:\/\//, '').split(/[\\/]/);
        const at = segments.lastIndexOf('server');
        return at > 0 ? segments[at - 1] : undefined;
    }
}
