/**
 * Per-subject OpenAPI schema fetcher.
 *
 * Fetches GET /rpc/{subject}/openapi.json once per subject, extracts the
 * params/result JSON Schema for each operationId, and caches the result.
 *
 * The server is expected to expose an OpenAPI spec at this well-known path
 * for each namespace. See plans/ui/server-schema-api.md for the full contract.
 *
 * Also reads server-stored UI customizations from the schema document's
 * x-ui-customizations extension (keyed by {subject}.{object}).
 */
import type {ISchemaOverlay} from '@feasibleone/blong';
import {deepMerge} from './defaults.js';

/** Per-operationId schema: params and result JSON Schema objects */
export interface IOperationSchema {
    params?: Record<string, unknown>;
    result?: Record<string, unknown>;
}

/** Cached subject API map: operationId → IOperationSchema */
type SubjectApi = Record<string, IOperationSchema>;

/** User customization blob stored server-side, keyed by "subject.object" */
type UICustomizations = Record<string, Record<string, unknown>>;

/** Singleton per-subject cache */
const subjectCache = new Map<string, Promise<SubjectApi>>();

/** UI customization cache */
const customizationCache = new Map<string, UICustomizations>();

/** Base URL for fetching subject OpenAPI specs — overridable for tests */
let baseUrl = '';

export function setBaseUrl(url: string): void {
    baseUrl = url;
}

/** Override the fetcher function (used by mock) */
type FetchFn = (url: string) => Promise<unknown>;
let fetchFn: FetchFn = url => fetch(url).then(r => r.json());

export function setFetchFn(fn: FetchFn): void {
    fetchFn = fn;
    // Clear caches so next access re-fetches with new function
    subjectCache.clear();
    customizationCache.clear();
}

async function loadSubjectApi(subject: string): Promise<SubjectApi> {
    const url = `${baseUrl}/rpc/${subject}/openapi.json`;
    let doc: {
        paths?: Record<
            string,
            Record<
                string,
                {
                    operationId?: string;
                    requestBody?: {
                        content?: {'application/json'?: {schema?: Record<string, unknown>}};
                    };
                    responses?: {
                        '200'?: {
                            content?: {'application/json'?: {schema?: Record<string, unknown>}};
                        };
                    };
                }
            >
        >;
        'x-ui-customizations'?: UICustomizations;
    };

    try {
        doc = (await fetchFn(url)) as typeof doc;
    } catch {
        // Server not available — return empty (mocks may inject data via setFetchFn)
        return {};
    }

    if (doc['x-ui-customizations']) {
        customizationCache.set(subject, doc['x-ui-customizations']);
    }

    const api: SubjectApi = {};
    for (const path of Object.values(doc.paths ?? {})) {
        for (const method of Object.values(path)) {
            if (!method.operationId) continue;
            const bodySchema = method.requestBody?.content?.['application/json']?.schema as
                | Record<string, unknown>
                | undefined;
            const resultSchema = method.responses?.['200']?.content?.['application/json']
                ?.schema as Record<string, unknown> | undefined;

            // Unwrap JSON-RPC envelope: {jsonrpc, method, params} → params
            let params: Record<string, unknown> | undefined;
            if ((bodySchema?.properties as Record<string, unknown>)?.jsonrpc) {
                params = (bodySchema?.properties as Record<string, unknown>)?.params as
                    | Record<string, unknown>
                    | undefined;
            } else {
                params = bodySchema;
            }

            // Unwrap result envelope: {jsonrpc, id, result} → result
            const result =
                ((resultSchema?.properties as Record<string, unknown>)?.result as Record<
                    string,
                    unknown
                >) ?? resultSchema;

            api[method.operationId] = {params, result};
        }
    }
    return api;
}

/** Fetch (and cache) the OpenAPI schema map for a subject namespace */
export function getSubjectApi(subject: string): Promise<SubjectApi> {
    if (!subjectCache.has(subject)) {
        subjectCache.set(subject, loadSubjectApi(subject));
    }
    return subjectCache.get(subject)!;
}

/**
 * Derive the enriched schema for a specific subject.object combination.
 *
 * Merge order (later wins):
 * 1. Server params/result schema from OpenAPI (find → list items, get → single)
 * 2. Browser model schema overlay (from ModelSpec.schema)
 * 3. Server-stored user customizations (x-ui-customizations in OpenAPI doc)
 */
export async function getObjectSchema(
    subject: string,
    object: string,
    browserOverlay: ISchemaOverlay = {},
): Promise<Record<string, unknown>> {
    const api = await getSubjectApi(subject);

    // Standard method names (overridable via ModelSpec.methods)
    const findOp = `${subject}.${object}.find`;
    const getOp = `${subject}.${object}.get`;

    // Server schema: extract list-item schema from find, and single from get
    const serverListItems = (api[findOp]?.result as Record<string, unknown> | undefined) ?? {};
    const serverSingleResult = (api[getOp]?.result as Record<string, unknown> | undefined) ?? {};

    // Build base schema from server data
    const base: Record<string, unknown> = deepMerge(
        {} as Record<string, unknown>,
        serverListItems,
        serverSingleResult,
    );

    // Apply browser model overlay
    const withOverlay = deepMerge(base, browserOverlay as Record<string, unknown>);

    // Apply any server-stored user customizations for this object
    const customizations = customizationCache.get(subject)?.[`${subject}.${object}`] ?? {};
    return deepMerge(withOverlay, customizations);
}
