import {Dropdown} from '../primereact/index.js';

import type {IDropdownOption, IWidgetProps} from '@feasibleone/blong';
import {useEffect, useRef, useState} from 'react';
import {useWatch, type Control} from 'react-hook-form';
import {useBlongForm} from '../components/Form/FormContext.js';
import {useBlongUi} from '../context/BlongUiContext.js';
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
}: IWidgetProps & {parentValue: unknown}) {
    const {
        fetch: fetchAction,
        options: staticOptions,
        dropdown: dropdownKey,
        parent,
    } = schema.widget ?? {};
    const {dispatch} = useBlongUi();

    const [options, setOptions] = useState<SelectOption[]>(
        () => staticOptions ? toOptions(staticOptions) : [],
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
                    dispatch('portal.dropdown.list', {names: [key]}) as Promise<
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
                    // BlongUiProvider. Widget renders with empty options.
                });

            return () => {
                cancelled = true;
            };
        }

        // Priority 2: explicit fetch action (re-fetch when parent value changes)
        if (!fetchAction) return;
        const params: Record<string, unknown> = {};
        if (parent && parentValue !== undefined) params[parent] = parentValue;
        (dispatch(fetchAction, params) as Promise<unknown>)
            .then(data => {
                if (!cancelled) setOptions(toOptions(data));
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line @eslint-react/exhaustive-deps -- parent and staticOptions intentionally omitted
    }, [fetchAction, dropdownKey, dispatch, parentValue]);

    // Filter options by parent value (client-side cascade).
    // Supports both named-key format ({continent: 1}) and generic parent key ({parent: 1}).
    const visibleOptions =
        parent && parentValue !== undefined
            ? options.filter(o => {
                  const opt = o as unknown as Record<string, unknown>;
                  return opt[parent] === parentValue || opt['parent'] === parentValue;
              })
            : options;

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
            showClear={!schema.required}
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
    ...props
}: IWidgetProps & {
    parentFieldName: string;
    control: Control<Record<string, unknown>>;
}) {
    const parentValue = useWatch({control, name: parentFieldName});
    return (
        <DropdownCore
            {...props}
            parentValue={parentValue}
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

    if (formCtx?.control && parent) {
        return (
            <ConnectedDropdown
                {...props}
                parentFieldName={parent}
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
