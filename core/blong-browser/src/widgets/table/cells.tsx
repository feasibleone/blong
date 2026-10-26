/**
 * How a table cell reads and how it edits.
 *
 * A body is the text a reader sees; an editor is what replaces it while the row is
 * being changed. Both are pure functions of a row, so they live here rather than in
 * the component that decides when a row is editable: a dropdown cell reads the label
 * the backend joined beside its key, and writes back the label and the `lookup`
 * fields a pick carries.
 */
import {ActionButton} from '../../components/ActionButton/ActionButton.js';
import {Text} from '../../components/Text/Text.js';
import {translatedLabel} from '../../hooks/useText.js';
import type {FormatFn, FormatType} from '../../lib/format.js';
import {
    Calendar,
    Checkbox,
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
} from '../../primereact/index.js';

import type {IEnrichedFieldSchema} from '@feasibleone/blong';
import React, {createContext, use, useEffect, useRef, useState} from 'react';
import {dateIn, dateOut} from '../DateWidget.js';
import {
    type DropdownOption,
    KEY,
    type Row,
    currentCycleState,
    nextCycleState,
    optionsForRow,
    resolveCycleStates,
} from './model.js';

/**
 * The picks a row has made while it is being edited, by row key.
 *
 * PrimeReact keeps an editing row's draft to itself and memoizes the body cell, so
 * re-rendering the table does not reach a cell whose list depends on a sibling — the
 * context does, because a consumer re-renders whatever its memoized ancestors decide.
 * See `rowDrafts` for why the table has to remember the picks at all. `@@D-617`
 */
export const RowDraftContext = createContext<Record<string, Row>>({});

export function renderBody(
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
            const item = options.find(o => o.value === value);
            // A joined label is data — the read translated it in the active
            // language. Only a static option label is a dictionary key (`D-635`).
            const text = label != null ? String(label) : translatedLabel(item?.label ?? '');
            return <span data-testid={cellId}>{text || (value != null ? String(value) : '')}</span>;
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
            const labels = arr.map(v =>
                translatedLabel(options.find(o => o.value === v)?.label ?? String(v)),
            );
            return <span data-testid={cellId}>{labels.join(', ')}</span>;
        }
        case 'select': {
            const bodyField = fieldSchema.widget?.body;
            const label = bodyField ? rowData[bodyField] : undefined;
            const item = options.find(o => o.value === value);
            const text = label != null ? String(label) : translatedLabel(item?.label ?? '');
            return <span data-testid={cellId}>{text || (value != null ? String(value) : '')}</span>;
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
export function RowCellEditor({
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
export function InlineCellEditor({
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

export function renderEditor(
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
