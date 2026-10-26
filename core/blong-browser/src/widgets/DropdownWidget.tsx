import {Dropdown} from '../primereact/index.js';

import type {IDropdownOption, IWidgetProps} from '@feasibleone/blong';
import {useEffect, useRef, useState} from 'react';
import {useWatch, type Control} from 'react-hook-form';
import {useBlongForm} from '../components/Form/FormContext.js';
import {useBlong} from '../context/BlongContext.js';
import {useOptionLabel} from '../hooks/useText.js';
import {dropdownRegistry} from '../model/dropdownRegistry.js';

type SelectOption = IDropdownOption;

function toOptions(data: unknown): SelectOption[] {
    if (!Array.isArray(data)) return [];
    return data.map((item: Record<string, unknown>) => ({
        ...item, // preserve extra properties (e.g., parent field keys for cascade filtering)
        label: String(item.label ?? item.name ?? item.value ?? item),
        value: item.value ?? item,
    }));
}

/**
 * Core rendering logic for DropdownWidget.
 * Receives `parentValue` already resolved — either from `useWatch` (inside a Form)
 * or `undefined` (standalone / no cascade needed).
 */
function DropdownCore({
    id,
    name,
    schema,
    value,
    onChange,
    onBlur,
    error,
    readOnly,
    disabled,
    parentValue,
    filterValues,
}: IWidgetProps & {parentValue: unknown; filterValues?: Record<string, unknown>}) {
    const {
        fetch: fetchAction,
        options: staticOptions,
        dropdown: dropdownKey,
        parent,
    } = schema.widget ?? {};
    const {handler} = useBlong();
    // A static option label is one the model declares, so it is a dictionary key.
    // An option the server produced is data — translated by the query that read
    // it, in the language the read asked for — and is rendered exactly as it
    // arrived (`D-635`).
    const optionLabel = useOptionLabel();

    const [options, setOptions] = useState<SelectOption[]>(() =>
        staticOptions ? toOptions(staticOptions) : [],
    );

    // Clear this widget's value when the parent selection changes
    const prevParentValueRef = useRef<unknown>(parentValue);
    useEffect(() => {
        if (parent === undefined) return;
        if (prevParentValueRef.current !== parentValue) {
            prevParentValueRef.current = parentValue;
            if (value !== undefined && value !== null) onChange(undefined);
        }
    }, [parentValue, parent, onChange, value]);

    useEffect(() => {
        let cancelled = false;

        // Skip async load when static options are already provided
        if (staticOptions) return;

        // Priority 1: named dropdown via portal orchestrator (handles batching + caching)
        if (dropdownKey) {
            const loader = (key: string) =>
                (
                    handler.portalDropdownList({names: [key]}, {}) as Promise<
                        Record<string, unknown>
                    >
                ).then(result => toOptions(result[key]));

            dropdownRegistry
                .get(dropdownKey, loader)
                .then(data => {
                    if (!cancelled) setOptions(data);
                })
                .catch(() => {
                    // Error already surfaced by the central dispatch wrapper in
                    // BlongProvider. Widget renders with empty options.
                });

            return () => {
                cancelled = true;
            };
        }

        // Priority 2: explicit fetch action (re-fetch when parent value changes)
        if (!fetchAction) return;
        const params: Record<string, unknown> = {};
        if (parent && parentValue !== undefined) params[parent] = parentValue;
        (handler[fetchAction](params, {}) as Promise<unknown>)
            .then(data => {
                if (!cancelled) setOptions(toOptions(data));
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line @eslint-react/exhaustive-deps -- parent and staticOptions intentionally omitted
    }, [fetchAction, dropdownKey, handler, parentValue]);

    // Filter options by parent value (client-side cascade).
    // Supports both named-key format ({continent: 1}) and generic parent key ({parent: 1}).
    // `optionsFilter` is the explicit form — `{optionProperty: formField}` — for a list
    // whose options carry the key under another name, or that depend on more than one
    // field. An empty field leaves the list whole, so the first pick is never blocked.
    // @@D-615
    const optionsFilter = schema.widget?.optionsFilter;
    // Only the model's own option list is translated here; a fetched list is data.
    const translatedOptions = staticOptions
        ? options.map(o => ({...o, label: optionLabel(o)}))
        : options;
    const visibleOptions = optionsFilter
        ? translatedOptions.filter(o => {
              const candidate = o as unknown as Record<string, unknown>;
              return Object.entries(optionsFilter).every(([optionProperty, formField]) => {
                  const want = filterValues?.[formField];
                  if (want === undefined || want === null || want === '') return true;
                  return String(candidate[optionProperty]) === String(want);
              });
          })
        : parent && parentValue !== undefined
          ? translatedOptions.filter(o => {
                const opt = o as unknown as Record<string, unknown>;
                return opt[parent] === parentValue || opt['parent'] === parentValue;
            })
          : translatedOptions;

    if (readOnly) {
        const found = visibleOptions.find(o => o.value === value);
        return (
            <span className="blong-display">
                {found?.label ?? (value != null ? String(value) : '')}
            </span>
        );
    }

    const isParentEmpty = !!parent && (parentValue === undefined || parentValue === null);

    return (
        <Dropdown
            inputId={id ?? name}
            data-testid={id ?? name}
            value={value}
            options={visibleOptions}
            onChange={e => onChange(e.value)}
            onHide={onBlur}
            disabled={disabled || isParentEmpty}
            className={`blong-dropdown w-full ${error ? 'p-invalid' : ''}`}
            showClear={!schema.fieldRequired}
            filter={visibleOptions.length > 8}
            placeholder={schema.placeholder ?? 'Select…'}
        />
    );
}

/**
 * Connected variant — uses `useWatch` to subscribe only to the specific parent field.
 * This component is only rendered when inside a Form that has a `control` and a `parent`
 * field is configured.  It re-renders only when the parent field value changes, not on
 * every keystroke in any other field.
 */
function ConnectedDropdown({
    parentFieldName,
    control,
    filterFields,
    ...props
}: IWidgetProps & {
    parentFieldName?: string;
    control: Control<Record<string, unknown>>;
    filterFields?: string[];
}) {
    const watched = parentFieldName ? [parentFieldName, ...(filterFields ?? [])] : filterFields;
    const values = useWatch({
        control,
        name: (watched ?? []) as string[],
    }) as unknown[] | undefined;
    const parentValue = parentFieldName ? values?.[0] : undefined;
    const filterValues = filterFields
        ? Object.fromEntries(
              filterFields.map((field, index) => [
                  field,
                  values?.[(parentFieldName ? 1 : 0) + index],
              ]),
          )
        : undefined;
    return (
        <DropdownCore
            {...props}
            parentValue={parentValue}
            filterValues={filterValues}
        />
    );
}

/**
 * DropdownWidget — wraps PrimeReact Dropdown with cascade-filtering support.
 *
 * When a `parent` field is configured in the schema and the widget is rendered inside
 * a Form, it delegates to `ConnectedDropdown` which subscribes only to that specific
 * parent field via `useWatch`.  This means the dropdown only rerenders when the parent
 * field changes — not on every keystroke in any field.
 *
 * When used standalone (no Form context / no parent), rendering is handled directly.
 */
export function DropdownWidget(props: IWidgetProps) {
    const formCtx = useBlongForm();
    const parent = props.schema.widget?.parent;
    const filterFields = Object.values(props.schema.widget?.optionsFilter ?? {});

    if (formCtx?.control && (parent || filterFields.length > 0)) {
        return (
            <ConnectedDropdown
                {...props}
                parentFieldName={parent}
                filterFields={filterFields.length > 0 ? filterFields : undefined}
                control={formCtx.control}
            />
        );
    }

    return (
        <DropdownCore
            {...props}
            parentValue={undefined}
        />
    );
}
