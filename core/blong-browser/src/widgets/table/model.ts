/**
 * The parts of a table that are not React: what a column is, how a cell's value is
 * narrowed to its row, and what a pick carries beside its key.
 *
 * Kept apart from `TableWidget` so a page that only needs one of these — a test, an
 * adapter, another widget — reads it without the component's state.
 */
import type {ICycleCellState, IEnrichedFieldSchema, IWidgetProps} from '@feasibleone/blong';
import label from '../../lib/label.js';

export type Row = Record<string, unknown>;
export type DropdownOption = {value: unknown; label: string; [k: string]: unknown};

/** The key a form row carries so an edit lands on the row it was made on. */
export const KEY = '__key';

/**
 * The widget type a column renders as. A declared `widget.type` wins; otherwise the
 * schema is read for the shape the column must show.
 */
export function resolveWidgetType(schema: IEnrichedFieldSchema): string {
    if (schema.widget?.type) return schema.widget.type;
    // A column that names a dropdown (or a static option list) holds a key, not the
    // text a reader wants: render the option's label, never the stored id. @@D-612
    if (schema.widget?.dropdown) return 'dropdown';
    if (schema.widget?.options) return 'select';
    if (schema.widget?.cycle || schema.widget?.states) return 'cycle';
    if (schema.action) return 'action';
    if (schema.type === 'boolean') return 'boolean';
    if (schema.type === 'number') return 'number';
    if (schema.type === 'integer') return 'integer';
    if (schema.format === 'date-time') return 'dateTime';
    if (schema.format === 'date') return 'date';
    return 'input';
}

/**
 * Named state sets for a `cycle` cell — the boolean cases a pivot toggles.
 * Clicking the cell advances to the next state, so the column needs no
 * row-edit mode.  The empty state renders as a blank cell and is named
 * `Not set` (also the cell's `title`, which tests read).
 */
export const CYCLE_PRESETS: Record<string, ICycleCellState[]> = {
    // check → cross → empty
    'tri-state': [
        {value: true, icon: 'pi pi-check text-green-500', label: 'Yes'},
        {value: false, icon: 'pi pi-times text-red-500', label: 'No'},
        {value: null, label: 'Not set'},
    ],
    // check → empty
    'check-empty': [
        {value: true, icon: 'pi pi-check text-green-500', label: 'Yes'},
        {value: null, label: 'Not set'},
    ],
    // check → cross (a value is always set)
    'check-cross': [
        {value: true, icon: 'pi pi-check text-green-500', label: 'Yes'},
        {value: false, icon: 'pi pi-times text-red-500', label: 'No'},
    ],
};

export function resolveCycleStates(schema: IEnrichedFieldSchema): ICycleCellState[] {
    const cfg = schema.widget as {cycle?: string; states?: ICycleCellState[]} | undefined;
    if (cfg?.states?.length) return cfg.states;
    if (cfg?.cycle && CYCLE_PRESETS[cfg.cycle]) return CYCLE_PRESETS[cfg.cycle];
    return CYCLE_PRESETS['tri-state'];
}

export function isCycleCell(schema: IEnrichedFieldSchema): boolean {
    return schema.widget?.type === 'cycle' || !!schema.widget?.cycle || !!schema.widget?.states;
}

/** Cycle values compare loosely, so `true`/`1` and `null`/`undefined` are one state. */
export function sameCycleValue(a: unknown, b: unknown): boolean {
    if (a == null || b == null) return (a ?? null) === (b ?? null);
    if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b);
    return a === b;
}

export function currentCycleState(
    states: ICycleCellState[],
    value: unknown,
): ICycleCellState | undefined {
    return states.find(s => sameCycleValue(s.value, value));
}

/** An unset cell advances to the first state of the cycle. */
export function nextCycleState(states: ICycleCellState[], value: unknown): ICycleCellState {
    const index = states.findIndex(s => sameCycleValue(s.value, value));
    return states[(index + 1) % states.length];
}

export function getColumnOptions(
    schema: IEnrichedFieldSchema,
    dropdowns?: Record<string, unknown[]>,
): DropdownOption[] {
    const raw =
        schema.widget?.options ?? (schema.widget?.dropdown && dropdowns?.[schema.widget.dropdown]);
    if (!Array.isArray(raw)) return [];
    return raw as DropdownOption[];
}

/**
 * Narrow a pick-list's options to the row they are offered for.
 *
 * `optionsFilter: {optionProperty: rowField}` is the explicit form, and several
 * pairs are a conjunction. `parent` is the shorthand for the common case, where the
 * option carries the key under the field's own name — or under `parent`, which is
 * how the form-level cascade already works, so both conventions are honoured. A row
 * field with no value yet leaves the list whole: the first pick must not be blocked
 * by the very value it is about to set. @@D-615
 */
export function optionsForRow(
    options: DropdownOption[],
    schema: IEnrichedFieldSchema,
    row: Row | undefined,
): DropdownOption[] {
    if (!row) return options;
    const filter = schema.widget?.optionsFilter;
    if (filter) {
        return options.filter(option => {
            const candidate = option as unknown as Record<string, unknown>;
            return Object.entries(filter).every(([optionProperty, rowField]) => {
                const want = row[rowField];
                if (want === undefined || want === null || want === '') return true;
                return String(candidate[optionProperty]) === String(want);
            });
        });
    }
    const parent = schema.widget?.parent;
    if (!parent) return options;
    const want = row[parent];
    if (want === undefined || want === null || want === '') return options;
    return options.filter(option => {
        const candidate = option as unknown as Record<string, unknown>;
        return candidate[parent] === want || candidate['parent'] === want;
    });
}

/**
 * The fields a pick writes beside its key: the label the column shows (`widget.body`)
 * and whatever `widget.lookup` copies from the option — so a saved row never carries
 * a label that disagrees with its key. `@@D-614`
 */
export function pickPatch(
    fieldSchema: IEnrichedFieldSchema,
    options: DropdownOption[],
    picked: unknown,
): Row {
    const pick = options.find(option => option.value === picked);
    if (!pick) return {};
    const patch: Row = {};
    const bodyField = fieldSchema.widget?.body;
    if (bodyField) patch[bodyField] = pick.label;
    for (const [optionKey, rowField] of Object.entries(fieldSchema.widget?.lookup ?? {})) {
        patch[rowField] = (pick as Record<string, unknown>)[optionKey];
    }
    return patch;
}

/** The columns a table renders, from `widget.columns` or from the item schema. */
export function resolveColumns(
    widget: IWidgetProps['schema']['widget'],
    items: IWidgetProps['schema']['items'],
): {
    field: string;
    header: string;
    filter?: boolean;
    sortable?: boolean;
    fieldSchema: IEnrichedFieldSchema;
}[] {
    const properties = items?.properties as Record<string, IEnrichedFieldSchema> | undefined;
    const cols = widget?.columns;

    if (cols && Array.isArray(cols)) {
        return cols.map(c => ({
            field: c,
            header: label(properties?.[c]?.title, c)!,
            filter: !!(properties?.[c] as Record<string, unknown>)?.filter,
            sortable: !!(properties?.[c] as Record<string, unknown>)?.sort,
            fieldSchema: properties?.[c] ?? {},
        }));
    }
    if (cols && typeof cols === 'object') {
        return Object.entries(cols).map(([field, cfg]) => ({
            field,
            header: label((cfg as Record<string, unknown>)?.title as string, field)!,
            fieldSchema: properties?.[field] ?? {},
        }));
    }
    const hidden = new Set(widget?.hidden ?? []);
    const show = cols ? (Array.isArray(cols) ? cols : Object.keys(cols)) : null;
    if (properties) {
        return Object.entries(properties)
            .filter(([field]) => !hidden.has(field) && (!show || show.includes(field)))
            .map(([field, schema]) => ({
                field,
                header: label(schema.title, field)!,
                filter: !!(schema as Record<string, unknown>).filter,
                sortable: !!(schema as Record<string, unknown>).sort,
                fieldSchema: schema,
            }));
    }
    return [];
}

/** An empty row for the columns a table declares, seeded with its own defaults. */
export function newRow(
    colFields: string[],
    properties?: Record<string, IEnrichedFieldSchema>,
): Row {
    const row: Row = {};
    for (const field of colFields) {
        const schema = properties?.[field];
        if (schema && 'default' in (schema as Record<string, unknown>)) {
            row[field] = (schema as Record<string, unknown>).default;
        } else if (schema?.type === 'boolean' || schema?.widget?.type === 'boolean') {
            row[field] = false;
        } else if (
            schema?.type === 'number' ||
            schema?.type === 'integer' ||
            ['number', 'integer', 'currency', 'percent'].includes(schema?.widget?.type ?? '')
        ) {
            row[field] = null;
        } else {
            row[field] = '';
        }
    }
    row[KEY] = Math.random().toString();
    return row;
}

export function resolveParentField(parent?: string): string | undefined {
    if (!parent) return undefined;
    if (parent.startsWith('$.selected.')) return parent.slice('$.selected.'.length);
    return parent;
}

/**
 * Extract the stable key value from a parent selection row.
 * Uses `keyFieldName` as the primary key field.
 * `keyFieldName` defaults to 'id' in the widget config, so this value
 * is always valid when the widget is properly configured.
 */
export function getParentKeyValue(
    parentRow: Record<string, unknown> | null,
    keyFieldName: string,
): unknown {
    if (!parentRow) return null;
    return parentRow[keyFieldName];
}
