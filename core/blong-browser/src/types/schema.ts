/**
 * Schema registry type definitions.
 */
import type {IEnrichedSchema} from './widget.js';

/** Schema fetcher function — resolves a schema by name */
export type SchemaFetcher = (name?: string) => Promise<ISchemaDocument>;

/** OpenAPI document shape (minimal) */
export interface ISchemaDocument {
    openapi?: string;
    info?: {title: string; version: string};
    components?: {
        schemas?: Record<string, IJsonSchema>;
    };
    paths?: Record<string, unknown>;
}

/** JSON Schema object */
export interface IJsonSchema {
    title?: string;
    description?: string;
    type?: string;
    properties?: Record<string, IJsonSchema>;
    required?: string[];
    items?: IJsonSchema;
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    pattern?: string;
    enum?: unknown[];
    readOnly?: boolean;
    'x-filter'?: boolean;
    'x-sort'?: boolean;
    'x-cards'?: string[];
    'x-widget'?: Record<string, unknown>;
    [key: string]: unknown;
}

/** Schema registry interface */
export interface ISchemaRegistry {
    /** Fetch and cache schema document */
    load(url?: string): Promise<void>;
    /** Get enriched schema by name (e.g. 'model.tree') */
    get(name: string): IEnrichedSchema | undefined;
    /** Resolve schema by name — fetches if not cached */
    resolve(name: string): Promise<IEnrichedSchema>;
    /** Manually set a schema (for mocking) */
    set(name: string, schema: IEnrichedSchema): void;
    /** Check if schema is loaded */
    has(name: string): boolean;
}
