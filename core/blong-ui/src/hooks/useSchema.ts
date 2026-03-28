/**
 * useSchema — fetch and cache the OpenAPI schema from the server gateway.
 *
 * The schema is fetched once from `/documentation/json` and cached by
 * TanStack Query. Consumers can look up request/response schemas by
 * namespace + method name.
 */

import {useQuery} from '@tanstack/react-query';
import type {OpenAPIV3_1} from 'openapi-types';

import type {BlongSchema} from '../types.js';

/** Options for the useSchema hook. */
export interface UseSchemaOptions {
    /** Base URL of the Blong server (default: current origin). */
    baseUrl?: string;
    /** Stale time in ms (default: 5 minutes). */
    staleTime?: number;
    /** Whether to enable the query (default: true). */
    enabled?: boolean;
}

/** Result of parsing the OpenAPI document for a specific method. */
export interface MethodSchema {
    /** Request body schema (for form generation). */
    request?: BlongSchema;
    /** Response schema (for table/detail generation). */
    response?: BlongSchema;
    /** Method description from the OpenAPI spec. */
    description?: string;
    /** Method summary from the OpenAPI spec. */
    summary?: string;
}

async function fetchOpenApiDoc(baseUrl: string): Promise<OpenAPIV3_1.Document> {
    const res = await fetch(`${baseUrl}/documentation/json`);
    if (!res.ok) throw new Error(`Failed to fetch OpenAPI schema: ${res.status}`);
    return res.json() as Promise<OpenAPIV3_1.Document>;
}

/**
 * Resolve a `$ref` string to its target schema within the OpenAPI document.
 */
function resolveRef(doc: OpenAPIV3_1.Document, ref: string): BlongSchema | undefined {
    // $ref format: "#/components/schemas/MyType"
    const parts = ref.replace(/^#\//, '').split('/');
    let current: unknown = doc;
    for (const part of parts) {
        if (current == null || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current as BlongSchema | undefined;
}

/**
 * Extract the request body schema from a path item operation.
 */
function extractRequestSchema(
    doc: OpenAPIV3_1.Document,
    operation: OpenAPIV3_1.OperationObject,
): BlongSchema | undefined {
    const body = operation.requestBody;
    if (!body) return undefined;

    const resolved =
        '$ref' in body ? resolveRef(doc, (body as OpenAPIV3_1.ReferenceObject).$ref) : body;
    if (!resolved || '$ref' in resolved) return undefined;

    const content = (resolved as OpenAPIV3_1.RequestBodyObject).content;
    const jsonContent = content?.['application/json'];
    if (!jsonContent?.schema) return undefined;

    const schema = jsonContent.schema;
    if ('$ref' in schema) return resolveRef(doc, schema.$ref);
    return schema as BlongSchema;
}

/**
 * Extract the success response schema from a path item operation.
 */
function extractResponseSchema(
    doc: OpenAPIV3_1.Document,
    operation: OpenAPIV3_1.OperationObject,
): BlongSchema | undefined {
    const responses = operation.responses;
    if (!responses) return undefined;

    // Look for 200 or 201 response
    const successResponse = responses['200'] ?? responses['201'];
    if (!successResponse) return undefined;

    const resolved =
        '$ref' in successResponse
            ? resolveRef(doc, (successResponse as OpenAPIV3_1.ReferenceObject).$ref)
            : successResponse;
    if (!resolved || '$ref' in resolved) return undefined;

    const content = (resolved as OpenAPIV3_1.ResponseObject).content;
    const jsonContent = content?.['application/json'];
    if (!jsonContent?.schema) return undefined;

    const schema = jsonContent.schema;
    if ('$ref' in schema) return resolveRef(doc, schema.$ref);
    return schema as BlongSchema;
}

/**
 * Look up the schema for a specific JSON-RPC method.
 *
 * The Blong gateway maps methods to paths like:
 * `POST /rpc/{subject}/{object}/{predicate}`
 */
export function lookupMethodSchema(
    doc: OpenAPIV3_1.Document,
    method: string,
): MethodSchema | undefined {
    const paths = doc.paths;
    if (!paths) return undefined;

    // Try direct path match: /rpc/subject/object/predicate
    const parts = method.match(/^([a-z]+)\.([a-z]+)\.([a-z]+)$/i);
    if (parts) {
        const rpcPath = `/rpc/${parts[1]}/${parts[2]}/${parts[3]}`;
        const pathItem = paths[rpcPath];
        if (pathItem) {
            const operation =
                (pathItem as OpenAPIV3_1.PathItemObject).post ??
                (pathItem as OpenAPIV3_1.PathItemObject).get;
            if (operation) {
                return {
                    request: extractRequestSchema(doc, operation),
                    response: extractResponseSchema(doc, operation),
                    description: operation.description,
                    summary: operation.summary,
                };
            }
        }
    }

    // Fallback: scan all paths for operationId match
    for (const [, pathItem] of Object.entries(paths)) {
        if (!pathItem) continue;
        for (const httpMethod of ['get', 'post', 'put', 'delete', 'patch'] as const) {
            const operation = (pathItem as OpenAPIV3_1.PathItemObject)[httpMethod];
            if (operation?.operationId === method) {
                return {
                    request: extractRequestSchema(doc, operation),
                    response: extractResponseSchema(doc, operation),
                    description: operation.description,
                    summary: operation.summary,
                };
            }
        }
    }

    return undefined;
}

/**
 * Hook to fetch and cache the full OpenAPI document from the server.
 *
 * @example
 * ```tsx
 * const { doc, getMethodSchema, isLoading } = useSchema();
 * const schema = getMethodSchema('user.user.get');
 * ```
 */
export function useSchema(options: UseSchemaOptions = {}) {
    const {baseUrl = '', staleTime = 5 * 60 * 1000, enabled = true} = options;

    const query = useQuery({
        queryKey: ['blong-openapi-schema', baseUrl],
        queryFn: () => fetchOpenApiDoc(baseUrl),
        staleTime,
        enabled,
    });

    const getMethodSchema = (method: string): MethodSchema | undefined => {
        if (!query.data) return undefined;
        return lookupMethodSchema(query.data, method);
    };

    return {
        /** The full OpenAPI document. */
        doc: query.data,
        /** Look up request/response schemas for a JSON-RPC method. */
        getMethodSchema,
        /** Whether the schema is currently loading. */
        isLoading: query.isLoading,
        /** Whether the schema fetch failed. */
        isError: query.isError,
        /** The error, if any. */
        error: query.error,
        /** Refetch the schema. */
        refetch: query.refetch,
    };
}
