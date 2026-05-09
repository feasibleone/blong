/**
 * Schema registry — fetches, normalizes, and enriches OpenAPI/JSON Schema objects.
 * The registry is the single source of truth for schema metadata in the browser.
 */
import type {IEnrichedFieldSchema, IEnrichedSchema, IWidgetConfig} from '@feasibleone/blong';
import type {IJsonSchemaExtended, ISchemaDocument, ISchemaRegistry} from '../types/schema.js';

/** Default OpenAPI endpoint */
const DEFAULT_SCHEMA_URL = '/openapi.json';

class SchemaRegistry implements ISchemaRegistry {
    private cache = new Map<string, IEnrichedSchema>();
    private document: ISchemaDocument | null = null;
    private loadPromise: Promise<void> | null = null;

    async load(url = DEFAULT_SCHEMA_URL): Promise<void> {
        if (this.loadPromise) return this.loadPromise;
        this.loadPromise = fetch(url)
            .then(r => r.json() as Promise<ISchemaDocument>)
            .then(doc => {
                this.document = doc;
                // Pre-populate cache from components.schemas
                const schemas = doc.components?.schemas ?? {};
                for (const [name, schema] of Object.entries(schemas)) {
                    const key = schemaNameToKey(name);
                    this.cache.set(key, enrichSchema(key, schema));
                }
            })
            .catch(err => {
                console.warn('[blong-browser] Failed to load schema document:', err);
                this.loadPromise = null;
            });
        return this.loadPromise;
    }

    get(name: string): IEnrichedSchema | undefined {
        return this.cache.get(normalizeName(name));
    }

    async resolve(name: string): Promise<IEnrichedSchema> {
        const key = normalizeName(name);
        if (this.cache.has(key)) return this.cache.get(key)!;
        await this.load();
        return this.cache.get(key) ?? {name: key, title: key, properties: {}};
    }

    set(name: string, schema: IEnrichedSchema): void {
        this.cache.set(normalizeName(name), {...schema, name: normalizeName(name)});
    }

    has(name: string): boolean {
        return this.cache.has(normalizeName(name));
    }
}

/** Convert OpenAPI component name to dotted key (e.g. 'ModelTree' → 'model.tree') */
function schemaNameToKey(name: string): string {
    // PascalCase → dotted.lower (naive, adjust for actual naming conventions)
    return name
        .replace(/([A-Z])/g, (_, c, i) => (i === 0 ? c.toLowerCase() : `.${c.toLowerCase()}`))
        .replace(/\.$/, '');
}

/** Normalize a schema name to lowercase dotted form */
function normalizeName(name: string): string {
    return name.toLowerCase().replace(/\//g, '.').replace(/\s+/g, '.');
}

/** Enrich a raw JSON Schema into a normalized IEnrichedSchema */
export function enrichSchema(name: string, raw: IJsonSchemaExtended): IEnrichedSchema {
    const properties: Record<string, IEnrichedFieldSchema> = {};
    const rawProps = raw.properties ?? {};
    const required = new Set(raw.required ?? []);

    for (const [fieldName, fieldSchema] of Object.entries(rawProps)) {
        properties[fieldName] = enrichField(
            fieldName,
            fieldSchema as IJsonSchemaExtended,
            required,
        );
    }

    return {
        name,
        title: raw.title ?? name,
        description: raw.description,
        properties,
        required: raw.required,
    };
}

/** Normalize a single field schema */
function enrichField(
    name: string,
    raw: IJsonSchemaExtended,
    required: Set<string>,
): IEnrichedFieldSchema {
    const widget = resolveWidget(name, raw);
    return {
        name,
        title: raw.title ?? formatTitle(name),
        description: raw.description,
        type: raw.type,
        minLength: raw.minLength,
        maxLength: raw.maxLength,
        minimum: raw.minimum,
        maximum: raw.maximum,
        pattern: raw.pattern,
        enum: raw.enum,
        readOnly: raw.readOnly,
        required: required.has(name),
        'x-filter': raw['x-filter'] as boolean | undefined,
        'x-sort': raw['x-sort'] as boolean | undefined,
        'x-cards': raw['x-cards'] as string[] | undefined,
        'x-widget': raw['x-widget'] as Partial<IWidgetConfig> | undefined,
        widget,
    };
}

/** Infer widget config from field type and extensions */
function resolveWidget(name: string, raw: IJsonSchemaExtended): IWidgetConfig {
    const xWidget = (raw['x-widget'] ?? {}) as Partial<IWidgetConfig>;
    if (xWidget.type) return xWidget as IWidgetConfig;

    // Infer from JSON Schema type
    const type = raw.type;
    if (type === 'boolean') return {type: 'boolean'};
    if (type === 'integer') return {type: 'integer'};
    if (type === 'number') return {type: 'number'};
    if (raw.enum)
        return {type: 'select', options: raw.enum.map(v => ({value: v, label: String(v)}))};
    if (name.toLowerCase().includes('date') && !name.toLowerCase().includes('time'))
        return {type: 'date'};
    if (name.toLowerCase().includes('datetime')) return {type: 'dateTime'};
    if (name.toLowerCase().includes('time')) return {type: 'time'};
    if (name.toLowerCase().includes('password')) return {type: 'password'};
    if (name.toLowerCase().includes('description') || name.toLowerCase().includes('notes'))
        return {type: 'textArea'};

    return {type: 'input'};
}

/** Convert camelCase or snake_case field name to Title Case label */
function formatTitle(name: string): string {
    return name
        .replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .replace(/^./, s => s.toUpperCase())
        .trim();
}

/** Singleton registry instance */
export const schemaRegistry = new SchemaRegistry();
