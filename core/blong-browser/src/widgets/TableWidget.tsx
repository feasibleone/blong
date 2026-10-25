import {ActionButton} from '../components/ActionButton/ActionButton.js';
import {useFormatValue} from '../hooks/useFormat.js';
import type {FormatFn, FormatType} from '../lib/format.js';
import label from '../lib/label.js';
import {
    Calendar,
    Checkbox,
    Column,
    DataTable,
    Dropdown,
    FileUpload,
    InputMask,
    InputNumber,
    InputText,
    InputTextarea,
    MultiSelect,
    Password,
    RadioButton,
    SelectButton,
    Toolbar,
    type DataTableSelectionChangeParams,
} from '../primereact/index.js';

import type {
    ICycleCellState,
    IDropdownOption,
    IEnrichedFieldSchema,
    IWidgetProps,
    IWidgetToolbarButton,
} from '@feasibleone/blong';
import {useQuery} from '@tanstack/react-query';
import React, {createContext, use, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Button} from '../components/Button/Button.js';
import {useBlongFormState} from '../components/Form/FormContext.js';
import {Text} from '../components/Text/Text.js';
import {useBlong} from '../context/BlongContext.js';
import {dropdownRegistry} from '../model/dropdownRegistry.js';
import {dateIn, dateOut} from './DateWidget.js';

type Row = Record<string, unknown>;
type DropdownOption = {value: unknown; label: string; [k: string]: unknown};

const KEY = '__key';

/**
 * The picks a row has made while it is being edited, by row key.
 *
 * PrimeReact keeps an editing row's draft to itself and memoizes the body cell, so
 * re-rendering the table does not reach a cell whose list depends on a sibling — the
 * context does, because a consumer re-renders whatever its memoized ancestors decide.
 * See `rowDrafts` for why the table has to remember the picks at all. `@@D-617`
 */
const RowDraftContext = createContext<Record<string, Row>>({});

function resolveWidgetType(schema: IEnrichedFieldSchema): string {
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
const CYCLE_PRESETS: Record<string, ICycleCellState[]> = {
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

function resolveCycleStates(schema: IEnrichedFieldSchema): ICycleCellState[] {
    const cfg = schema.widget as {cycle?: string; states?: ICycleCellState[]} | undefined;
    if (cfg?.states?.length) return cfg.states;
    if (cfg?.cycle && CYCLE_PRESETS[cfg.cycle]) return CYCLE_PRESETS[cfg.cycle];
    return CYCLE_PRESETS['tri-state'];
}

function isCycleCell(schema: IEnrichedFieldSchema): boolean {
    return schema.widget?.type === 'cycle' || !!schema.widget?.cycle || !!schema.widget?.states;
}

/** Cycle values compare loosely, so `true`/`1` and `null`/`undefined` are one state. */
function sameCycleValue(a: unknown, b: unknown): boolean {
    if (a == null || b == null) return (a ?? null) === (b ?? null);
    if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b);
    return a === b;
}

function currentCycleState(states: ICycleCellState[], value: unknown): ICycleCellState | undefined {
    return states.find(s => sameCycleValue(s.value, value));
}

/** An unset cell advances to the first state of the cycle. */
function nextCycleState(states: ICycleCellState[], value: unknown): ICycleCellState {
    const index = states.findIndex(s => sameCycleValue(s.value, value));
    return states[(index + 1) % states.length];
}

function getColumnOptions(
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
function optionsForRow(
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
function pickPatch(
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

function resolveColumns(
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

function newRow(colFields: string[], properties?: Record<string, IEnrichedFieldSchema>): Row {
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

function renderBody(
    widgetType: string,
    field: string,
    rowData: Row,
    cellId: string,
    options: DropdownOption[],
    keyFieldName: string,
    fieldSchema: IEnrichedFieldSchema,
    onCycle: ((value: unknown) => void) | undefined,
    format: FormatFn,
): React.ReactNode {
    const value = rowData[field];

    switch (widgetType) {
        case 'action':
            return (
                <ActionButton
                    label={String(value)}
                    className="p-button-link p-0"
                    action={fieldSchema?.action}
                    params={{
                        [keyFieldName]: rowData[keyFieldName],
                        id: rowData[keyFieldName],
                        current: rowData,
                    }}
                />
            );

        case 'cycle': {
            // Click-to-cycle cell: no row-edit mode, so each click commits the next
            // state straight into the form value.  `title` names the current
            // state, which is also what the Playwright helper matches on.
            const states = resolveCycleStates(fieldSchema);
            const state = currentCycleState(states, value);
            return (
                <span
                    data-testid={cellId}
                    className="blong-cycle cursor-pointer"
                    title={state?.label ?? 'Not set'}
                    onClick={event => {
                        event.stopPropagation();
                        onCycle?.(nextCycleState(states, value).value);
                    }}
                >
                    {state?.icon ? <i className={state.icon} /> : <span>&nbsp;</span>}
                </span>
            );
        }
        case 'password':
            return <span data-testid={cellId}>{value ? '*'.repeat(10) : ''}</span>;
        case 'file': {
            // A stored file is a name, or a record carrying its own url. The link is
            // only offered when the column says the value is downloadable: a url
            // built from a path that is not there would be a broken link. @@D-615
            const raw = rowData[field];
            const items = (Array.isArray(raw) ? raw : raw == null ? [] : [raw]) as Array<
                string | Record<string, unknown>
            >;
            if (!items.length) return <span data-testid={cellId} />;
            const pathField = fieldSchema.widget?.pathField ?? 'hash';
            const basePath = fieldSchema.widget?.basePath ?? '';
            const rowPath = rowData[pathField];
            const rowHref = rowPath ? `${basePath}${String(rowPath)}` : undefined;
            return (
                <span data-testid={cellId}>
                    {items.map((item, index) => {
                        const record = typeof item === 'string' ? undefined : item;
                        const text = String(
                            record?.name ?? record?.fileName ?? record?.label ?? item ?? '',
                        );
                        const href = record
                            ? ((record.objectURL ?? record.url ?? rowHref) as string | undefined)
                            : rowHref;
                        return (
                            // One cell may hold two files of the same name and url, so
                            // the position is part of the only identity available.
                            // eslint-disable-next-line @eslint-react/no-array-index-key
                            <React.Fragment key={`${text}-${href ?? ''}-${index}`}>
                                {index > 0 && ', '}
                                {fieldSchema.widget?.download && href ? (
                                    <a
                                        href={String(href)}
                                        download={text}
                                        className="text-inherit"
                                    >
                                        {text}
                                    </a>
                                ) : (
                                    text
                                )}
                            </React.Fragment>
                        );
                    })}
                </span>
            );
        }
        case 'radio':
            return (
                <span data-testid={cellId}>
                    <RadioButton
                        checked={Boolean(value)}
                        disabled
                        readOnly
                    />
                </span>
            );
        case 'selectTableRadio':
            return (
                <span
                    data-testid={cellId}
                    onClick={event => {
                        event.stopPropagation();
                        onCycle?.(!value);
                    }}
                >
                    <RadioButton
                        checked={Boolean(value)}
                        readOnly
                        // Without a commit path the cell cannot write, so it should not
                        // look as if it could: a read-only card still renders the flag.
                        disabled={onCycle === undefined}
                    />
                </span>
            );
        case 'dropdown': {
            // The row carries the label the backend joined beside the key, so the
            // cell needs no options at all. Options are the fallback for a table
            // whose data has no label column. @@D-614
            const bodyField = fieldSchema.widget?.body;
            const label = bodyField ? rowData[bodyField] : undefined;
            if (label != null) return <span data-testid={cellId}>{String(label)}</span>;
            const item = options.find(o => o.value === value);
            return (
                <span data-testid={cellId}>
                    {item?.label ?? (value != null ? String(value) : '')}
                </span>
            );
        }
        case 'dropdownTree': {
            function findLabel(nodes: DropdownOption[], v: unknown): string | undefined {
                for (const n of nodes) {
                    if (n.key === v || n.value === v) return n.label;
                    if (Array.isArray(n.children)) {
                        const found = findLabel(n.children as DropdownOption[], v);
                        if (found != null) return found;
                    }
                }
            }
            return (
                <span data-testid={cellId}>
                    {findLabel(options, value) ?? (value != null ? String(value) : '')}
                </span>
            );
        }
        case 'multiSelect':
        case 'multiSelectTree': {
            const bodyField = fieldSchema.widget?.body;
            const label = bodyField ? rowData[bodyField] : undefined;
            if (label != null) {
                return (
                    <span data-testid={cellId}>
                        {Array.isArray(label) ? label.join(', ') : String(label)}
                    </span>
                );
            }
            const arr = Array.isArray(value) ? (value as unknown[]) : [];
            const labels = arr.map(v => options.find(o => o.value === v)?.label ?? String(v));
            return <span data-testid={cellId}>{labels.join(', ')}</span>;
        }
        case 'select': {
            const bodyField = fieldSchema.widget?.body;
            const label = bodyField ? rowData[bodyField] : undefined;
            if (label != null) return <span data-testid={cellId}>{String(label)}</span>;
            const item = options.find(o => o.value === value);
            return (
                <span data-testid={cellId}>
                    {item?.label ?? (value != null ? String(value) : '')}
                </span>
            );
        }
        case 'date':
        case 'time':
        case 'dateTime': {
            if (value == null) return <span data-testid={cellId} />;
            return (
                <span data-testid={cellId}>
                    {format(value, widgetType as FormatType, fieldSchema.widget?.formatOptions)}
                </span>
            );
        }
        case 'number':
        case 'integer':
        case 'currency':
        case 'percent':
            return (
                <span
                    data-testid={cellId}
                    className="block text-right"
                >
                    {value == null
                        ? ''
                        : format(
                              value,
                              widgetType as FormatType,
                              fieldSchema.widget?.formatOptions,
                              fieldSchema.widget?.useGrouping,
                          )}
                </span>
            );
        default:
            if (value != null && fieldSchema.widget?.translation) {
                return (
                    <span data-testid={cellId}>
                        <Text>{String(value)}</Text>
                    </span>
                );
            }
            return <span data-testid={cellId}>{value != null ? String(value) : ''}</span>;
    }
}

/**
 * One editing cell, rendered as a consumer of the row's recorded picks.
 *
 * A memoized cell in PrimeReact does not re-render when the table around it does, so
 * the list a cell offers is otherwise fixed at the moment the row entered edit mode —
 * whole, for a row that is still empty. Reading the picks from the context brings the
 * new list to the cell that depends on them. `@@D-617`
 */
function RowCellEditor({
    rowData,
    options,
    fieldSchema,
    render,
}: {
    rowData: Row;
    options: DropdownOption[];
    fieldSchema: IEnrichedFieldSchema;
    render: (editedRow: Row, options: DropdownOption[]) => React.ReactNode;
}) {
    const drafts = use(RowDraftContext);
    const draft = drafts[String(rowData[KEY])];
    const editedRow = draft ? {...rowData, ...draft} : rowData;
    return <>{render(editedRow, optionsForRow(options, fieldSchema, editedRow))}</>;
}

/**
 * One cell that edits in place.
 *
 * The value it shows is its own, held here until the commit has round-tripped through
 * the form: an input bound straight to the committed value loses keystrokes whenever a
 * re-render lands between two of them, and what is on screen must never lag the
 * keyboard. Every change still commits as it happens. `@@D-618`
 */
function InlineCellEditor({
    rowData,
    field,
    options,
    fieldSchema,
    render,
    commit,
}: {
    rowData: Row;
    field: string;
    options: DropdownOption[];
    fieldSchema: IEnrichedFieldSchema;
    render: (args: {
        rowData: Row;
        options: DropdownOption[];
        onDraft: (value: unknown) => void;
    }) => React.ReactNode;
    commit: (value: unknown) => void;
}) {
    const committed = rowData[field];
    const [draft, setDraft] = useState<unknown>(committed);
    const focusedRef = useRef(false);
    // A value that changes from outside — a load, a reset, a different row in the same
    // slot — wins over what was typed, but only while the cell is not being used: the
    // committed value arrives a render after the keystroke that caused it, so adopting
    // it mid-typing would replace the text with the value it is about to become.
    useEffect(() => {
        if (focusedRef.current) return;
        // eslint-disable-next-line @eslint-react/set-state-in-effect
        setDraft(committed);
    }, [committed]);
    const editedRow = {...rowData, [field]: draft};
    return (
        <div
            onFocus={() => {
                focusedRef.current = true;
            }}
            onBlur={() => {
                focusedRef.current = false;
            }}
        >
            {render({
                rowData: editedRow,
                options: optionsForRow(options, fieldSchema, editedRow),
                onDraft: (value: unknown) => {
                    setDraft(value);
                    commit(value);
                },
            })}
        </div>
    );
}

function renderEditor(
    widgetType: string,
    fieldSchema: IEnrichedFieldSchema,
    field: string,
    rowData: Row,
    cellId: string,
    cellName: string,
    editorCallback: (v: unknown) => void,
    options: DropdownOption[],
): React.ReactNode {
    const value = rowData[field];

    switch (widgetType) {
        case 'integer':
            return (
                <InputNumber
                    inputId={cellId}
                    name={cellName}
                    data-testid={cellId}
                    value={value == null ? null : Number(value)}
                    onValueChange={e => editorCallback(e.value)}
                    className="w-full"
                    inputClassName="w-full text-right"
                    showButtons
                    min={fieldSchema.minimum}
                    max={fieldSchema.maximum}
                />
            );
        case 'number':
            return (
                <InputNumber
                    inputId={cellId}
                    name={cellName}
                    data-testid={cellId}
                    value={value == null ? null : Number(value)}
                    onValueChange={e => editorCallback(e.value)}
                    className="w-full"
                    inputClassName="w-full text-right"
                    min={fieldSchema.minimum}
                    max={fieldSchema.maximum}
                />
            );
        case 'currency':
        case 'percent':
            return (
                <InputNumber
                    inputId={cellId}
                    name={cellName}
                    data-testid={cellId}
                    value={value == null ? null : Number(value)}
                    onValueChange={e => editorCallback(e.value)}
                    className="w-full"
                    inputClassName="w-full text-right"
                    mode="decimal"
                    minFractionDigits={2}
                    maxFractionDigits={4}
                    min={fieldSchema.minimum}
                    max={fieldSchema.maximum}
                />
            );
        case 'dropdown':
        case 'dropdownTree':
            return (
                <Dropdown
                    inputId={cellId}
                    name={cellName}
                    data-testid={cellId}
                    value={value}
                    options={options}
                    // The label and the `lookup` fields a pick carries are applied by
                    // the caller: a row being edited keeps them on PrimeReact's copy,
                    // a row edited in place writes them with the value. `@@D-614`
                    onChange={e => editorCallback(e.value)}
                    className="w-full blong-dropdown"
                    showClear={!fieldSchema.fieldRequired}
                    placeholder="Select…"
                    filter={options.length > 8}
                />
            );
        case 'multiSelect':
        case 'multiSelectTree':
            return (
                <MultiSelect
                    inputId={cellId}
                    name={cellName}
                    data-testid={cellId}
                    value={Array.isArray(value) ? value : []}
                    options={options}
                    onChange={e => editorCallback(e.value)}
                    className="w-full blong-multiselect"
                    display="chip"
                    placeholder="Select…"
                />
            );
        case 'select':
            return (
                <SelectButton
                    id={cellId}
                    name={cellName}
                    data-testid={cellId}
                    value={value}
                    options={options}
                    onChange={e => editorCallback(e.value)}
                    className="white-space-nowrap"
                />
            );
        case 'password':
            return (
                <Password
                    inputId={cellId}
                    name={cellName}
                    data-testid={cellId}
                    value={value != null ? String(value) : ''}
                    onInput={e => editorCallback(e.currentTarget.value)}
                    className="w-full"
                    inputClassName="w-full"
                    feedback={false}
                />
            );
        case 'date':
            return (
                <Calendar
                    inputId={cellId}
                    name={cellName}
                    data-testid={cellId}
                    showOnFocus={false}
                    value={value != null ? dateIn(value as string | Date) : null}
                    onChange={e =>
                        editorCallback(e.value instanceof Date ? dateOut(e.value) : e.value)
                    }
                    showIcon
                    className="w-full"
                />
            );
        case 'time':
            return (
                <Calendar
                    inputId={cellId}
                    name={cellName}
                    data-testid={cellId}
                    showOnFocus={false}
                    value={value != null ? new Date(value as string) : new Date(1970, 0, 1)}
                    onChange={e => editorCallback(e.value)}
                    timeOnly
                    showIcon
                    className="w-full"
                />
            );
        case 'dateTime':
            return (
                <Calendar
                    inputId={cellId}
                    name={cellName}
                    data-testid={cellId}
                    showOnFocus={false}
                    value={value != null ? dateIn(value as string | Date) : null}
                    onChange={e =>
                        editorCallback(e.value instanceof Date ? dateOut(e.value) : e.value)
                    }
                    showTime
                    showIcon
                    className="w-full"
                />
            );
        case 'mask':
            return (
                <InputMask
                    id={cellId}
                    name={cellName}
                    data-testid={cellId}
                    value={value != null ? String(value) : ''}
                    onChange={e => editorCallback(e.value)}
                    mask={fieldSchema.widget?.mask ?? ''}
                    className="w-full"
                />
            );
        case 'boolean':
        case 'checkbox':
            return (
                // data-testid mirrors the display cell (`${tableId}-${row}-${field}`)
                // so tests can target the boolean cell editor for check/uncheck.
                <span
                    data-testid={cellId}
                    onClick={e => e.stopPropagation()}
                >
                    <Checkbox
                        inputId={cellId}
                        checked={Boolean(value)}
                        onChange={e => editorCallback(e.checked)}
                    />
                </span>
            );
        case 'radio':
            return (
                <span
                    data-testid={cellId}
                    onClick={e => e.stopPropagation()}
                >
                    <RadioButton
                        inputId={cellId}
                        checked={Boolean(value)}
                        onChange={e => editorCallback(e.checked)}
                    />
                </span>
            );
        case 'file':
            return (
                <FileUpload
                    mode="basic"
                    id={cellId}
                    name={cellName}
                    data-testid={cellId}
                    accept={fieldSchema.widget?.accept}
                    chooseLabel="Choose"
                    onSelect={e => editorCallback([...(e.files ?? [])])}
                />
            );
        case 'text':
        case 'textArea':
            return (
                <InputTextarea
                    id={cellId}
                    name={cellName}
                    data-testid={cellId}
                    value={value != null ? String(value) : ''}
                    onChange={e => editorCallback(e.target.value)}
                    autoFocus
                    className="w-full"
                    rows={2}
                />
            );
        default:
            // input, chips, autocomplete, dateRange, etc.
            return (
                <InputText
                    id={cellId}
                    name={cellName}
                    data-testid={cellId}
                    value={value != null ? String(value) : ''}
                    onChange={e => editorCallback(e.target.value)}
                    autoFocus
                    className="w-full"
                />
            );
    }
}

function resolveParentField(parent?: string): string | undefined {
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
function getParentKeyValue(
    parentRow: Record<string, unknown> | null,
    keyFieldName: string,
): unknown {
    if (!parentRow) return null;
    return parentRow[keyFieldName];
}

// ── Template resolution helpers (for widget.toolbar params) ──────────────────

function getPath(obj: unknown, path: string): unknown {
    if (!obj || typeof obj !== 'object') return undefined;
    const parts = path.split('.');
    let cur: unknown = obj;
    for (const part of parts) {
        if (cur === null || cur === undefined) return undefined;
        cur = (cur as Record<string, unknown>)[part];
    }
    return cur;
}

function resolveToolbarParams(
    params: Record<string, unknown> | string | undefined,
    context: Record<string, unknown>,
): Record<string, unknown> | undefined {
    if (params === undefined || params === null) return undefined;
    if (typeof params === 'string') {
        const singleExpr = params.trim().match(/^\$\{([^}]+)\}$/);
        if (singleExpr) {
            const val = getPath(context, singleExpr[1].trim());
            if (val !== null && typeof val === 'object') return val as Record<string, unknown>;
            return {value: val};
        }
        const resolved = params.replace(/\$\{([^}]+)\}/g, (_, expr) => {
            const v = getPath(context, (expr as string).trim());
            return v === undefined || v === null
                ? ''
                : typeof v === 'object'
                  ? JSON.stringify(v)
                  : String(v);
        });
        return {value: resolved};
    }
    return Object.fromEntries(
        Object.entries(params).map(([k, v]) => {
            if (typeof v === 'string') {
                const r = resolveToolbarParams(v, context);
                return [k, r?.value !== undefined ? r.value : r];
            }
            return [k, v];
        }),
    );
}

function evalToolbarEnabled(
    enabled: IWidgetToolbarButton['enabled'],
    selection: Row[],
    currentRow: Row | null,
): boolean {
    if (enabled === 'current') return currentRow !== null;
    if (enabled === 'selected') return selection.length > 0 || currentRow !== null;
    return enabled !== false;
}

export function TableWidget({
    id,
    name,
    schema,
    value,
    onChange,
    readOnly,
    disabled,
    onSelect,
    dropdowns,
}: IWidgetProps) {
    const cols = resolveColumns(schema.widget, schema.items ?? schema);
    const colFields = cols.map(c => c.field);
    const tableId = id ?? name;
    const properties = (schema.items?.properties ?? schema.properties) as
        | Record<string, IEnrichedFieldSchema>
        | undefined;

    // ── listAction mode: external data loading ────────────────────────────
    const listAction = schema.widget?.listAction ?? '';
    const listParams = schema.widget?.listParams;
    const resultSet = schema.widget?.resultSet ?? 'items';
    const keyFieldName = schema.widget?.keyField ?? 'id';
    const initialPageSize = schema.widget?.pageSize ?? 25;
    const widgetToolbar = schema.widget?.toolbar ?? [];
    const widgetToolbarRight = schema.widget?.toolbarRight ?? [];
    const isListMode = !!listAction;

    // listAction-mode state
    const [searchInput, setSearchInput] = useState('');
    const [committedSearch, setCommittedSearch] = useState('');
    const [columnFilterInputs, setColumnFilterInputs] = useState<Record<string, string>>({});
    const [committedFilters, setCommittedFilters] = useState<Record<string, string>>({});
    const [listSortField, setListSortField] = useState<string | null>(null);
    const [listSortOrder, setListSortOrder] = useState<1 | -1>(1);
    const [listFirst, setListFirst] = useState(0);
    const [listPageSize, setListPageSize] = useState(initialPageSize);
    const filterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const {handler} = useBlong();
    const format = useFormatValue();

    // Columns whose cell declares `widget.dropdown` need their options to render a
    // label: without them the cell falls back to the stored value, and a resource
    // id is a base64 string that means nothing to a reader. The caller may pass a
    // map, and the model pages do not — so load what is missing through the portal
    // orchestrator, the same call the dropdown widgets make.
    const columnDropdownKeys = useMemo(
        () =>
            cols
                .map(col => properties?.[col.field]?.widget?.dropdown)
                .filter((key): key is string => typeof key === 'string' && key.length > 0),
        [cols, properties],
    );
    const [loadedDropdowns, setLoadedDropdowns] = useState<Record<string, unknown[]>>({});
    useEffect(() => {
        const missing = columnDropdownKeys.filter(
            key => !dropdowns?.[key] && !loadedDropdowns[key],
        );
        if (!missing.length) return;
        if (typeof handler?.portalDropdownList !== 'function') return;
        let cancelled = false;
        Promise.all(
            missing.map(name =>
                (
                    handler.portalDropdownList({names: [name]}, {}) as Promise<
                        Record<string, unknown>
                    >
                )
                    .then(
                        result => [name, Array.isArray(result[name]) ? result[name] : []] as const,
                    )
                    .catch(() => [name, []] as const),
            ),
        ).then(entries => {
            if (!cancelled) setLoadedDropdowns(prev => ({...prev, ...Object.fromEntries(entries)}));
        });
        return () => {
            cancelled = true;
        };
    }, [columnDropdownKeys, dropdowns, loadedDropdowns, handler]);

    /** The caller's map wins; the loaded one fills the gaps. */
    const resolvedDropdowns = useMemo(
        () => ({...loadedDropdowns, ...dropdowns}),
        [loadedDropdowns, dropdowns],
    );

    /**
     * The row fields some other column's list is narrowed by — a column's
     * `optionsFilter` row side, or its `parent`.
     *
     * A row being edited keeps its draft to itself until the row is saved, and the
     * cell editors are mounted when the row enters edit mode, so a cell that filters
     * on a sibling would keep the list it computed at that moment. For a new row that
     * is the whole list, because the sibling is still empty — the pick that should
     * narrow it then changes nothing on screen. The table therefore remembers those
     * picks itself and re-renders when one changes, which is what lets the dependent
     * cell recompute its list. @@D-617
     */
    const cascadeFields = useMemo(() => {
        const fields = new Set<string>();
        for (const col of cols) {
            const widget = col.fieldSchema.widget;
            if (widget?.parent) fields.add(widget.parent);
            for (const rowField of Object.values(widget?.optionsFilter ?? {})) {
                fields.add(String(rowField));
            }
        }
        return fields;
    }, [cols]);
    const [rowDrafts, setRowDrafts] = useState<Record<string, Row>>({});
    const recordRowDraft = useCallback(
        (row: Row, field: string, value: unknown) => {
            if (!cascadeFields.has(field)) return;
            const key = String(row[KEY]);
            setRowDrafts(prev => ({...prev, [key]: {...prev[key], [field]: value}}));
        },
        [cascadeFields],
    );

    /**
     * What the rendered rows depend on, beyond the data itself: the number of
     * options per label column. PrimeReact keeps a rendered row as it is and does
     * not redraw it when only the cell `body` callback changes, so options that
     * arrive after the first paint would leave the stored id on screen forever. A
     * key that changes when the counts change remounts the table exactly once, and
     * is constant for a table without label columns. @@D-612
     */
    const dropdownSignature = columnDropdownKeys
        .map(key => `${key}:${resolvedDropdowns[key]?.length ?? 0}`)
        .join('|');

    /**
     * The label columns the model reads instead of the keys. A list read asks the
     * backend for them, so a row arrives with its names attached and no cell has to
     * be resolved on the fly. @@D-614
     */
    const labelFields = useMemo(
        () =>
            cols
                .map(col => col.fieldSchema.widget?.body)
                .filter((field): field is string => typeof field === 'string'),
        [cols],
    );

    // Pivot tables source their rows from a named dropdown. When the caller did
    // not supply the options via the `dropdowns` prop (e.g. model pages), load
    // them on demand through the portal orchestrator so the pivot rows render.
    const [pivotOptions, setPivotOptions] = useState<Row[] | undefined>(undefined);
    const pivotDropdownKey = (schema.widget?.pivot as {dropdown?: string} | undefined)?.dropdown;
    useEffect(() => {
        if (!pivotDropdownKey) return;
        if (dropdowns?.[pivotDropdownKey]) return; // caller provided the options
        let cancelled = false;
        const loader = (name: string): Promise<IDropdownOption[]> =>
            (
                handler.portalDropdownList({names: [name]}, {}) as Promise<Record<string, unknown>>
            ).then(result => {
                const data = result[name];
                return (Array.isArray(data) ? data : []) as IDropdownOption[];
            });
        dropdownRegistry
            .get(pivotDropdownKey, loader)
            .then(data => {
                if (!cancelled) setPivotOptions(data as Row[]);
            })
            .catch(() => {
                // Error surfaced by the central dispatch wrapper; render without rows.
            });
        return () => {
            cancelled = true;
        };
    }, [pivotDropdownKey, dropdowns, handler]);

    // Subscribe to table selections from FormStateContext (slow-changing — only updates on
    // row selection events, never on keystrokes).  Falls back gracefully to undefined when
    // TableWidget is used outside a Form (e.g. in standalone stories / tests).
    const formState = useBlongFormState();

    // ── Report params (from report "Run" button) ──────────────────────────
    const reportMode = formState?.reportMode ?? false;
    const reportParams = formState?.reportParams;

    // ── Cascaded table filtering ───────────────────────────────────────────
    const parentFieldName = resolveParentField(schema.widget?.parent);
    const masterMapping = schema.widget?.master;
    const parentSelection = parentFieldName
        ? (formState?.tableSelections[parentFieldName] as
              | {row: Record<string, unknown>; index: number}
              | null
              | undefined)
        : undefined;

    // In listAction mode, reset paging and include master filter in server params
    // when parent selection changes. In non-listAction mode, client-side filtering applies.
    const prevParentKeyForPagingRef = useRef<unknown>(undefined);

    // Reset paging when the cascaded parent selection changes (listAction mode).
    // Compare using the row's keyField value for stable identity (not object reference).
    useEffect(() => {
        if (!isListMode || !parentFieldName) return;
        const curKey = getParentKeyValue(parentSelection?.row ?? null, keyFieldName);
        if (prevParentKeyForPagingRef.current === curKey) return;
        prevParentKeyForPagingRef.current = curKey;
        // eslint-disable-next-line @eslint-react/set-state-in-effect
        setListFirst(0);
        // eslint-disable-next-line @eslint-react/set-state-in-effect
        setSingleSelected(null);
    }, [isListMode, parentFieldName, parentSelection?.row, keyFieldName]);

    // Reset paging when report params change (new "Run Report" submission).
    const prevReportParamsRef = useRef<Record<string, unknown> | undefined>(undefined);
    useEffect(() => {
        if (!isListMode || !reportMode) return;
        if (prevReportParamsRef.current === reportParams) return;
        prevReportParamsRef.current = reportParams;
        if (reportParams !== undefined) {
            // eslint-disable-next-line @eslint-react/set-state-in-effect
            setListFirst(0);
        }
    }, [isListMode, reportMode, reportParams]);

    const mergedListParams = useMemo(() => {
        const filterBy = Object.fromEntries(
            Object.entries(committedFilters).filter(([, v]) => v !== ''),
        );
        // In listAction mode with parent cascade, send master filter keys as server-side params
        const cascadeFilter: Record<string, unknown> = {};
        if (isListMode && parentFieldName && masterMapping && parentSelection) {
            for (const [ownKey, parentKey] of Object.entries(masterMapping)) {
                cascadeFilter[ownKey] = parentSelection.row[parentKey];
            }
        }
        return {
            ...(listParams ?? {}),
            // Report params are merged before cascade/column filters so column filters take precedence
            ...(reportParams ?? {}),
            ...cascadeFilter,
            ...(labelFields.length > 0 ? {labels: labelFields} : {}),
            ...(Object.keys(filterBy).length > 0 ? {filterBy} : {}),
            ...(committedSearch ? {search: committedSearch} : {}),
            ...(listSortField
                ? {orderBy: [{field: listSortField, dir: listSortOrder === 1 ? 'ASC' : 'DESC'}]}
                : {}),
            paging: {pageSize: listPageSize, pageNumber: Math.floor(listFirst / listPageSize) + 1},
        };
    }, [
        listParams,
        reportParams,
        isListMode,
        parentFieldName,
        masterMapping,
        parentSelection,
        committedFilters,
        committedSearch,
        listSortField,
        listSortOrder,
        listFirst,
        listPageSize,
        labelFields,
    ]);

    type ListResult = Record<string, unknown>;
    const {data: listQueryData, isFetching: listLoading} = useQuery<ListResult>({
        queryKey: [listAction, mergedListParams],
        queryFn: () => handler[listAction](mergedListParams, {}) as Promise<ListResult>,
        // In report mode, wait until the user submits params (reportParams becomes defined)
        enabled: isListMode && (!reportMode || reportParams !== undefined),
        staleTime: 0,
        placeholderData: previousData => previousData,
    });

    const listRows: Row[] = useMemo(() => {
        if (!listQueryData) return [];
        if (resultSet && Array.isArray((listQueryData as Record<string, unknown>)[resultSet])) {
            return (listQueryData as Record<string, unknown>)[resultSet] as Row[];
        }
        if (Array.isArray(listQueryData)) return listQueryData as Row[];
        return [];
    }, [listQueryData, resultSet]);

    const listTotal: number = useMemo(() => {
        if (!listQueryData) return 0;
        const pagination = (listQueryData as {pagination?: {recordsTotal?: number}}).pagination;
        return typeof pagination?.recordsTotal === 'number'
            ? pagination.recordsTotal
            : listRows.length;
    }, [listQueryData, listRows.length]);

    const handleSearchChange = useCallback((v: string) => {
        setSearchInput(v);
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = setTimeout(
            () => {
                setCommittedSearch(v);
                setListFirst(0);
            },
            v === '' ? 0 : 350,
        );
    }, []);

    const handleColumnFilterChange = useCallback((field: string, v: string) => {
        setColumnFilterInputs(prev => ({...prev, [field]: v}));
        if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
        filterDebounceRef.current = setTimeout(
            () => {
                setCommittedFilters(prev => {
                    const next = {...prev, [field]: v};
                    if (v === '') delete next[field];
                    return next;
                });
                setListFirst(0);
            },
            v === '' ? 0 : 350,
        );
    }, []);

    // ── Rows source (form-value vs listAction) ────────────────────────────
    const rows: Row[] = isListMode
        ? listRows
        : (Array.isArray(value) ? (value as Row[]) : []).map((r, i) => ({
              ...r,
              [KEY]: (r as Row)[KEY] ?? i,
          }));

    // ── Pivot transformation ───────────────────────────────────────────────
    // When widget.pivot is configured, overlay existing data onto a fixed set
    // of rows derived from `examples` (static) or a named `dropdown` (dynamic).
    // The `join` map describes how pivot row fields map to actual data row fields.
    const pivotCfg = schema.widget?.pivot as
        | {examples?: Row[]; dropdown?: string; join?: Record<string, string>; defaults?: Row}
        | undefined;
    const pivotBaseRows: Row[] | undefined = pivotCfg
        ? (pivotCfg.examples ??
          (pivotCfg.dropdown
              ? ((dropdowns?.[pivotCfg.dropdown] as Row[] | undefined) ?? pivotOptions ?? undefined)
              : undefined))
        : undefined;
    const pivotJoinDataFields = new Set<string>(Object.values(pivotCfg?.join ?? {}));

    const baseRows: Row[] = pivotBaseRows
        ? (() => {
              const joinEntries = Object.entries(pivotCfg!.join ?? {});
              return pivotBaseRows.map((pivotRow, i) => {
                  const found = rows.find(r =>
                      joinEntries.every(([pivotKey, rowKey]) => pivotRow[pivotKey] === r[rowKey]),
                  );
                  // `defaults` seeds the non-join fields of a slot with no stored
                  // data (e.g. a tri-state cell starting as `inherit`).  Stored
                  // data wins over the default.
                  if (found) return {...pivotCfg!.defaults, ...found, [KEY]: `pivot-${i}`};
                  // Build an empty row seeded with the join field values
                  const seeded: Row = {...pivotCfg!.defaults, [KEY]: `pivot-${i}`};
                  for (const [pivotKey, rowKey] of joinEntries) {
                      seeded[rowKey] = pivotRow[pivotKey];
                  }
                  return seeded;
              });
          })()
        : rows;

    // Client-side cascaded filtering (non-listAction mode only).
    // In listAction mode, the cascade filter is sent to the server via mergedListParams.
    const filteredRows = useMemo(
        () =>
            !isListMode && parentFieldName && masterMapping
                ? parentSelection
                    ? baseRows.filter(r =>
                          Object.entries(masterMapping).every(
                              ([ownKey, parentKey]) => r[ownKey] === parentSelection.row[parentKey],
                          ),
                      )
                    : []
                : baseRows,
        [isListMode, parentFieldName, masterMapping, parentSelection, baseRows],
    );

    // ── Column filters ─────────────────────────────────────────────────────
    // One filter input per `filter: true` column, in both modes: a list table
    // sends the values to the server as `filterBy`, a form/pivot table filters
    // its rows here.  The form case is display-only — it never touches the form
    // value, so hiding a row cannot drop data on save.
    const filterFields = useMemo(() => cols.filter(c => c.filter).map(c => c.field), [cols]);
    /** A pick-list column filters on its key, exactly; a text column on a substring. */
    const pickFields = useMemo(
        () =>
            new Set(
                cols
                    .filter(c => c.fieldSchema.widget?.dropdown || c.fieldSchema.widget?.options)
                    .map(c => c.field),
            ),
        [cols],
    );
    const displayRows = useMemo(() => {
        if (isListMode || filterFields.length === 0) return filteredRows;
        const active = filterFields
            .map(field => [field, committedFilters[field] ?? ''] as const)
            .filter(([, text]) => text !== '');
        if (active.length === 0) return filteredRows;
        return filteredRows.filter(row =>
            active.every(([field, text]) =>
                pickFields.has(field)
                    ? String(row[field] ?? '') === text
                    : String(row[field] ?? '')
                          .toLocaleLowerCase()
                          .includes(text.toLocaleLowerCase()),
            ),
        );
    }, [isListMode, filteredRows, filterFields, pickFields, committedFilters]);

    /**
     * Sorting a form table reorders the view, not the value: a detail list keeps the
     * order the record was saved in, and the row key still identifies the row, so a
     * cell edit lands on the right one. The list mode sorts through the server.
     * @@D-615
     */
    const [formSortField, setFormSortField] = useState<string | null>(null);
    const [formSortOrder, setFormSortOrder] = useState<1 | -1>(1);
    const sortedRows = useMemo(() => {
        if (isListMode || !formSortField) return displayRows;
        const direction = formSortOrder;
        return [...displayRows].sort((left, right) => {
            const a = left[formSortField];
            const b = right[formSortField];
            // Empties last in either direction: a missing value says nothing about
            // its order among the values that exist.
            if (a == null || a === '') return b == null || b === '' ? 0 : 1;
            if (b == null || b === '') return -1;
            if (typeof a === 'number' && typeof b === 'number') return (a - b) * direction;
            return String(a).localeCompare(String(b)) * direction;
        });
    }, [isListMode, displayRows, formSortField, formSortOrder]);

    const [editingRows, setEditingRows] = useState<Record<string, boolean>>({});
    const [pendingEdit, setPendingEdit] = useState<Record<string, boolean> | null>(null);
    const [selected, setSelected] = useState<Row[]>([]);
    const [singleSelected, setSingleSelected] = useState<Row | null>(null);
    const allowEdit = schema.widget?.actions?.allowEdit !== false;
    const allowAdd = schema.widget?.actions?.allowAdd !== false && !pivotBaseRows;
    const allowDelete = schema.widget?.actions?.allowDelete !== false && !pivotBaseRows;
    const editable = !readOnly && allowEdit;
    // A pivot whose editable columns are all `cycle` cells is toggle-only: each
    // click commits a value, so the rows need no edit button at all.
    const cycleOnly =
        cols.some(c => isCycleCell(c.fieldSchema)) &&
        cols.every(c => isCycleCell(c.fieldSchema) || c.fieldSchema.readOnly === true);
    /**
     * A table whose cells are their own editors: no row-edit state, no pencil column,
     * every change written into the form value as it happens. The column is the unit
     * of refusal — a `readOnly` column still reads. `@@D-618`
     */
    const inlineEdit = !isListMode && editable && schema.widget?.inlineEdit === true;
    const needsRowEditor = !isListMode && editable && !cycleOnly && !inlineEdit;
    const interactionDisabled = disabled || readOnly;
    const isSingleSelect = schema.widget?.selectionMode === 'single';
    const widgetLabel = schema.widget?.label;

    const fireSingleSelect = useCallback(
        (row: Row | null) => {
            if (!row) {
                onSelect?.(name, null);
                return;
            }
            if (isListMode) {
                // In listAction mode rows have no KEY field; use keyFieldName
                const originalIndex = rows.findIndex(r => r[keyFieldName] === row[keyFieldName]);
                onSelect?.(name, {row: row as Record<string, unknown>, index: originalIndex});
                return;
            }
            const {[KEY]: _k, ...clean} = row;
            const originalIndex = rows.findIndex(r => r[KEY] === row[KEY]);
            onSelect?.(name, {row: clean as Record<string, unknown>, index: originalIndex});
        },
        [rows, name, onSelect, isListMode, keyFieldName],
    );

    const rowClass = useCallback(
        (data: Row) => {
            if (!isSingleSelect || !singleSelected) return '';
            const matchKey = isListMode ? keyFieldName : KEY;
            return data[matchKey] === singleSelected[matchKey] ? 'blong-table-current' : '';
        },
        [isSingleSelect, singleSelected, isListMode, keyFieldName],
    );

    const prevParentKeyForAutoSelectRef = useRef<unknown>(undefined);
    useEffect(() => {
        if (!schema.widget?.autoSelect || !parentFieldName) return;
        // Use the parent row's key field value for stable identity (not object reference)
        const curKey = getParentKeyValue(parentSelection?.row ?? null, keyFieldName);
        if (prevParentKeyForAutoSelectRef.current === curKey) return;
        prevParentKeyForAutoSelectRef.current = curKey;
        if (filteredRows.length > 0) {
            // eslint-disable-next-line @eslint-react/set-state-in-effect
            setSingleSelected(filteredRows[0]);
            fireSingleSelect(filteredRows[0]);
        } else {
            // eslint-disable-next-line @eslint-react/set-state-in-effect
            setSingleSelected(null);
            onSelect?.(name, null);
        }
    }, [
        name,
        parentSelection,
        parentFieldName,
        schema.widget?.autoSelect,
        filteredRows,
        fireSingleSelect,
        onSelect,
        keyFieldName,
    ]);

    useEffect(() => {
        if (!pendingEdit) return;
        // eslint-disable-next-line @eslint-react/set-state-in-effect
        setPendingEdit(null);
        // eslint-disable-next-line @eslint-react/set-state-in-effect
        setEditingRows(prev => ({...prev, ...pendingEdit}));
    }, [pendingEdit]);

    const onRowEditChange = useCallback((e: {data: Record<string, boolean>}) => {
        // A row that is no longer being edited leaves no picks behind: a cancelled
        // edit must not narrow the next one. @@D-617
        setRowDrafts({});
        setEditingRows(e.data);
    }, []);

    /**
     * Write one row back into the form value.  For a pivot table the row may not
     * exist in the value yet (its slot comes from the dropdown), so the merge is
     * keyed on the pivot's `join` fields — the same rule the row editor uses.
     */
    const mergeRow = useCallback(
        (rowData: Row): Row[] => {
            const {[KEY]: rowKey, ...rest} = rowData;
            if (pivotCfg) {
                const joinEntries = Object.entries(pivotCfg.join ?? {});
                const isMatch = (r: Row) => joinEntries.every(([, jk]) => r[jk] === rest[jk]);
                const updated = rows.some(isMatch)
                    ? rows.map(r => (isMatch(r) ? {...r, ...rest} : r))
                    : [...rows, rest];
                return updated.map(({[KEY]: _k, ...r}) => r);
            }
            const updated = rows.map(r => (r[KEY] === rowKey ? {...rest, [KEY]: rowKey} : r));
            return updated.map(({[KEY]: _k, ...r}) => r);
        },
        [rows, pivotCfg],
    );

    const onRowEditComplete = useCallback(
        (e: {newData: Row}) => {
            setRowDrafts({});
            onChange(mergeRow(e.newData));
        },
        [mergeRow, onChange],
    );

    /**
     * Commit one cell value straight into the form value — how a cycle cell and an
     * in-place cell write, with the label and `lookup` fields a pick carries. `@@D-618`
     */
    const commitCell = useCallback(
        (rowData: Row, field: string, nextValue: unknown, patch?: Row) =>
            onChange(mergeRow({...rowData, ...patch, [field]: nextValue})),
        [mergeRow, onChange],
    );

    const addRow = useCallback(
        (event: React.MouseEvent) => {
            event.preventDefault();
            const row = newRow(colFields, properties);
            if (parentSelection && masterMapping) {
                for (const [ownKey, parentKey] of Object.entries(masterMapping)) {
                    row[ownKey] = parentSelection.row[String(parentKey)];
                }
            }
            const updated = [...rows, row];
            onChange(updated.map(({[KEY]: _k, ...r}) => r));
            setPendingEdit({[rows.length]: true});
        },
        [rows, colFields, properties, onChange, parentSelection, masterMapping],
    );

    const deleteSelected = useCallback(
        (event: React.MouseEvent) => {
            event.preventDefault();
            const selectedKeys = new Set<unknown>();
            for (const r of selected) selectedKeys.add(r[KEY]);
            if (singleSelected) selectedKeys.add(singleSelected[KEY]);
            if (selectedKeys.size === 0) return;
            const updated = rows.filter(r => !selectedKeys.has(r[KEY]));
            setSelected([]);
            setSingleSelected(null);
            onSelect?.(name, null);
            onChange(updated.map(({[KEY]: _k, ...r}) => r));
        },
        [rows, selected, singleSelected, onChange, onSelect, name],
    );

    // ── Template context for custom toolbar params ────────────────────────
    const currentRowKey = singleSelected?.[isListMode ? keyFieldName : KEY];
    const templateContext = useMemo(
        () => ({
            [keyFieldName]: currentRowKey,
            id: currentRowKey,
            current: singleSelected,
            selected: selected.length > 0 ? selected : singleSelected ? [singleSelected] : [],
            ...(singleSelected ?? {}),
        }),
        [singleSelected, selected, keyFieldName, currentRowKey],
    );

    // ── Toolbar rendering ─────────────────────────────────────────────────
    const [busyCount, setBusyCount] = useState(0);
    const isBusy = busyCount > 0;

    const renderCustomButton = (btn: IWidgetToolbarButton, idx: number) => {
        const isEnabled = evalToolbarEnabled(btn.enabled, selected, singleSelected);
        const resolvedParams = resolveToolbarParams(btn.params, templateContext);
        return (
            <Button
                key={idx}
                label={btn.label}
                icon={btn.icon}
                className="p-button mr-2"
                type="button"
                disabled={isBusy || !isEnabled}
                onClick={e => {
                    e.preventDefault();
                    if (!btn.method) return;
                    setBusyCount(c => c + 1);
                    void (
                        handler[btn.method](resolvedParams ?? {}, {}) as Promise<unknown>
                    ).finally(() => setBusyCount(c => c - 1));
                }}
            />
        );
    };

    // listAction mode: search + paginator in toolbar right
    const listModeSearchBar = isListMode ? (
        <span
            style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                flexShrink: 0,
            }}
        >
            <i
                className="pi pi-search"
                style={{position: 'absolute', left: '0.5rem', pointerEvents: 'none'}}
            />
            <InputText
                value={searchInput}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder="Search…"
                data-testid="browse-search"
                style={{width: '9rem', paddingLeft: '1.75rem'}}
            />
            {searchInput && (
                <Button
                    icon="pi pi-times"
                    className="p-button-text p-button-sm"
                    style={{position: 'absolute', right: 0, padding: '0.25rem'}}
                    type="button"
                    onClick={() => handleSearchChange('')}
                />
            )}
        </span>
    ) : null;

    const hasCustomToolbar =
        widgetToolbar.length > 0 || widgetToolbarRight.length > 0 || isListMode;
    const actionButtons =
        !isListMode && editable ? (
            <>
                {allowAdd && (
                    <Button
                        label="Add"
                        icon="pi pi-plus"
                        className="p-button mr-2"
                        onClick={addRow}
                        type="button"
                        disabled={interactionDisabled}
                        data-testid={`${tableId}-addButton`}
                    />
                )}
                {allowDelete && (
                    <Button
                        label="Delete"
                        icon="pi pi-trash"
                        className="p-button"
                        onClick={deleteSelected}
                        type="button"
                        disabled={interactionDisabled || (!selected.length && !singleSelected)}
                        data-testid={`${tableId}-deleteButton`}
                    />
                )}
            </>
        ) : null;

    const toolbarLeftContent = (
        <>
            {widgetLabel && (
                <span className="p-card-title mr-2">
                    <Text>{widgetLabel}</Text>
                </span>
            )}
            {widgetToolbar.map(renderCustomButton)}
            {!widgetLabel && actionButtons}
        </>
    );

    const toolbarRightContent = (
        <>
            {widgetToolbarRight.map(renderCustomButton)}
            {widgetLabel && actionButtons}
            {listModeSearchBar}
        </>
    );

    const showToolbar = editable || widgetLabel || hasCustomToolbar;

    if (parentFieldName && masterMapping && !parentSelection) return null;

    // listAction mode: compute dataKey and active row key
    const dataKeyField = isListMode ? keyFieldName : KEY;

    return (
        <div
            data-testid={`${tableId}`}
            className="blong-table-widget w-full"
            style={isListMode ? {display: 'flex', flexDirection: 'column'} : undefined}
        >
            {showToolbar && (
                <Toolbar
                    left={toolbarLeftContent}
                    right={toolbarRightContent}
                    className="p-0 border-none"
                    style={{background: 'none'}}
                />
            )}
            <RowDraftContext value={rowDrafts}>
                <DataTable
                    key={dropdownSignature}
                    value={sortedRows}
                    // An in-place table never enters row editing: the cells are the
                    // editors, so there is no draft to save or cancel. @@D-618
                    editMode={!isListMode && editable && !inlineEdit ? 'row' : undefined}
                    editingRows={!isListMode && editable && !inlineEdit ? editingRows : undefined}
                    onRowEditChange={
                        !isListMode && editable && !inlineEdit ? onRowEditChange : undefined
                    }
                    onRowEditComplete={
                        !isListMode && editable && !inlineEdit ? onRowEditComplete : undefined
                    }
                    dataKey={dataKeyField}
                    size="small"
                    emptyMessage="No rows."
                    loading={isListMode ? listLoading : undefined}
                    lazy={isListMode}
                    rowClassName={rowClass}
                    selection={isSingleSelect ? singleSelected : selected}
                    onSelectionChange={(e: DataTableSelectionChangeParams) => {
                        if (isSingleSelect) {
                            const row = e.value as Row | null;
                            setSingleSelected(row);
                            fireSingleSelect(row);
                        } else {
                            setSelected(e.value as Row[]);
                        }
                    }}
                    selectionMode={isSingleSelect ? 'single' : 'multiple'}
                    metaKeySelection={false}
                    removableSort
                    sortField={
                        isListMode ? (listSortField ?? undefined) : (formSortField ?? undefined)
                    }
                    sortOrder={isListMode ? listSortOrder : formSortOrder}
                    onSort={
                        isListMode
                            ? (e: {sortField: string; sortOrder: number}) => {
                                  const order = (e.sortOrder ?? 0) as 0 | 1 | -1;
                                  setListSortField(order === 0 ? null : (e.sortField ?? null));
                                  setListSortOrder(order === 0 ? 1 : order);
                                  setListFirst(0);
                              }
                            : (e: {sortField: string; sortOrder: number}) => {
                                  const order = (e.sortOrder ?? 0) as 0 | 1 | -1;
                                  setFormSortField(order === 0 ? null : (e.sortField ?? null));
                                  setFormSortOrder(order === 0 ? 1 : order);
                              }
                    }
                >
                    {!isSingleSelect && (editable || isListMode) && !pivotBaseRows && (
                        <Column
                            selectionMode="multiple"
                            style={{width: '3rem', flexGrow: 0}}
                        />
                    )}
                    {cols.map(({field, header, filter, sortable, fieldSchema}) => {
                        const widgetType = resolveWidgetType(fieldSchema);
                        const options = getColumnOptions(fieldSchema, resolvedDropdowns);
                        const isPickList = !!(
                            fieldSchema.widget?.dropdown || fieldSchema.widget?.options
                        );
                        const isNumeric = ['number', 'integer', 'currency', 'percent'].includes(
                            widgetType,
                        );
                        const isBoolType = ['boolean', 'checkbox'].includes(widgetType);

                        return (
                            <Column
                                key={field}
                                field={field}
                                header={
                                    filter ? (
                                        <div
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '0.25rem',
                                            }}
                                        >
                                            <Text>{header}</Text>
                                            {isPickList ? (
                                                // A key column filters by picking the key,
                                                // the same way the cell is edited — typing a
                                                // substring can never match an id.
                                                <Dropdown
                                                    value={columnFilterInputs[field] ?? ''}
                                                    options={options}
                                                    onChange={e =>
                                                        handleColumnFilterChange(
                                                            field,
                                                            (e.value as string) ?? '',
                                                        )
                                                    }
                                                    showClear
                                                    placeholder="Filter…"
                                                    className="p-inputtext-sm"
                                                    style={{width: '100%', fontSize: '0.8125rem'}}
                                                    onClick={e => e.stopPropagation()}
                                                    data-testid={`${tableId}-filter-${field}`}
                                                />
                                            ) : (
                                                <InputText
                                                    value={columnFilterInputs[field] ?? ''}
                                                    onChange={e =>
                                                        handleColumnFilterChange(
                                                            field,
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder="Filter…"
                                                    className="p-inputtext-sm"
                                                    style={{width: '100%', fontSize: '0.8125rem'}}
                                                    onClick={e => e.stopPropagation()}
                                                    data-testid={`${tableId}-filter-${field}`}
                                                />
                                            )}
                                        </div>
                                    ) : (
                                        <Text>{header}</Text>
                                    )
                                }
                                sortable={sortable || isListMode}
                                alignHeader={isNumeric ? 'right' : undefined}
                                bodyClassName={isNumeric ? 'text-right' : undefined}
                                body={(rowData: Row, colOptions) => {
                                    const cellId = `${tableId}-${colOptions.rowIndex}-${field}`;
                                    const cellName = `${tableId}[${colOptions.rowIndex}].${field}`;
                                    /**
                                     * A cell that edits in place *is* its editor, so it
                                     * commits the moment it changes and there is nothing to
                                     * compare against: the value on screen is the value in
                                     * the form. @@D-618
                                     */
                                    if (
                                        inlineEdit &&
                                        !fieldSchema.readOnly &&
                                        !pivotJoinDataFields.has(field)
                                    ) {
                                        return (
                                            <InlineCellEditor
                                                rowData={rowData}
                                                field={field}
                                                options={options}
                                                fieldSchema={fieldSchema}
                                                commit={(nextValue: unknown) =>
                                                    commitCell(
                                                        rowData,
                                                        field,
                                                        nextValue,
                                                        pickPatch(fieldSchema, options, nextValue),
                                                    )
                                                }
                                                render={({
                                                    rowData: editedRow,
                                                    options: narrowed,
                                                    onDraft,
                                                }) =>
                                                    renderEditor(
                                                        widgetType,
                                                        fieldSchema,
                                                        field,
                                                        editedRow,
                                                        cellId,
                                                        cellName,
                                                        onDraft,
                                                        narrowed,
                                                    )
                                                }
                                            />
                                        );
                                    }
                                    if (isBoolType) {
                                        if (rowData[field] == null)
                                            return <span data-testid={cellId} />;
                                        return (
                                            <span data-testid={cellId}>
                                                <i
                                                    className={`pi ${
                                                        rowData[field]
                                                            ? 'pi-check text-green-500'
                                                            : 'pi-times text-red-500'
                                                    }`}
                                                />
                                            </span>
                                        );
                                    }
                                    const commit =
                                        editable && !fieldSchema.readOnly
                                            ? (nextValue: unknown) =>
                                                  commitCell(rowData, field, nextValue)
                                            : undefined;
                                    const node = renderBody(
                                        widgetType,
                                        field,
                                        rowData,
                                        cellId,
                                        options,
                                        keyFieldName,
                                        fieldSchema,
                                        commit,
                                        format,
                                    );
                                    // A cell that also carries the value it replaced shows
                                    // both, the current one first. The old value goes
                                    // through the same body, so a label, a date and a
                                    // currency read alike in both halves. @@D-615
                                    const compareField = fieldSchema.widget?.compare;
                                    if (
                                        !compareField ||
                                        rowData[compareField] === undefined ||
                                        String(rowData[compareField] ?? '') ===
                                            String(rowData[field] ?? '')
                                    ) {
                                        return node;
                                    }
                                    return (
                                        <span>
                                            <span
                                                data-testid={`${cellId}-new`}
                                                style={{color: 'var(--teal-500)'}}
                                            >
                                                {node}
                                            </span>
                                            <span
                                                data-testid={`${cellId}-old`}
                                                style={{
                                                    color: 'var(--orange-500)',
                                                    display: 'block',
                                                }}
                                            >
                                                {renderBody(
                                                    widgetType,
                                                    field,
                                                    {...rowData, [field]: rowData[compareField]},
                                                    `${cellId}-previous`,
                                                    options,
                                                    keyFieldName,
                                                    fieldSchema,
                                                    undefined,
                                                    format,
                                                )}
                                            </span>
                                        </span>
                                    );
                                }}
                                editor={
                                    !isListMode &&
                                    editable &&
                                    !fieldSchema.readOnly &&
                                    !pivotJoinDataFields.has(field)
                                        ? colOptions => {
                                              const cellId = `${tableId}-${colOptions.rowIndex}-${field}`;
                                              const cellName = `${tableId}[${colOptions.rowIndex}].${field}`;
                                              const rowData = colOptions.rowData as Row;
                                              return (
                                                  <RowCellEditor
                                                      rowData={rowData}
                                                      options={options}
                                                      fieldSchema={fieldSchema}
                                                      render={(editedRow, narrowed) =>
                                                          renderEditor(
                                                              widgetType,
                                                              fieldSchema,
                                                              field,
                                                              rowData,
                                                              cellId,
                                                              cellName,
                                                              (v: unknown) => {
                                                                  // The row being edited is
                                                                  // PrimeReact's copy: mutating it is
                                                                  // how the label and `lookup` fields
                                                                  // reach `onRowEditComplete`. @@D-614
                                                                  Object.assign(
                                                                      rowData,
                                                                      pickPatch(
                                                                          fieldSchema,
                                                                          options,
                                                                          v,
                                                                      ),
                                                                  );
                                                                  recordRowDraft(rowData, field, v);
                                                                  colOptions.editorCallback?.(v);
                                                              },
                                                              narrowed,
                                                          )
                                                      }
                                                  />
                                              );
                                          }
                                        : undefined
                                }
                            />
                        );
                    })}
                    {needsRowEditor && (
                        <Column
                            rowEditor
                            style={{width: '7rem', textAlign: 'center'}}
                        />
                    )}
                </DataTable>
            </RowDraftContext>
            {isListMode && listTotal > 0 && (
                <div
                    className="blong-table-paginator"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.5rem',
                        justifyContent: 'center',
                        userSelect: 'none',
                        flexShrink: 0,
                    }}
                >
                    <Button
                        icon="pi pi-angle-double-left"
                        className="p-button-text p-button-sm"
                        type="button"
                        disabled={listFirst === 0}
                        onClick={() => setListFirst(0)}
                    />
                    <Button
                        icon="pi pi-angle-left"
                        className="p-button-text p-button-sm"
                        type="button"
                        disabled={listFirst === 0}
                        onClick={() => setListFirst(Math.max(0, listFirst - listPageSize))}
                    />
                    <span style={{padding: '0 0.5rem', fontSize: '0.875rem'}}>
                        {Math.floor(listFirst / listPageSize) + 1} /{' '}
                        {Math.ceil(listTotal / listPageSize)}
                    </span>
                    <Button
                        icon="pi pi-angle-right"
                        className="p-button-text p-button-sm"
                        type="button"
                        disabled={listFirst + listPageSize >= listTotal}
                        onClick={() => setListFirst(listFirst + listPageSize)}
                    />
                    <Button
                        icon="pi pi-angle-double-right"
                        className="p-button-text p-button-sm"
                        type="button"
                        disabled={listFirst + listPageSize >= listTotal}
                        onClick={() =>
                            setListFirst((Math.ceil(listTotal / listPageSize) - 1) * listPageSize)
                        }
                    />
                    <select
                        value={listPageSize}
                        onChange={e => {
                            setListPageSize(Number(e.target.value));
                            setListFirst(0);
                        }}
                        style={{
                            marginLeft: '0.5rem',
                            background: 'var(--surface-overlay)',
                            color: 'var(--text-color)',
                            border: '1px solid var(--surface-border)',
                            borderRadius: 'var(--border-radius)',
                            padding: '0.2rem',
                        }}
                    >
                        {[10, 25, 50, 100].map(n => (
                            <option
                                key={n}
                                value={n}
                            >
                                {n}
                            </option>
                        ))}
                    </select>
                </div>
            )}
        </div>
    );
}
