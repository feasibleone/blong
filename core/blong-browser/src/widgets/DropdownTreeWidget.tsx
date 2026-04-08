import {TreeSelect, type TreeNode} from '../primereact/index.js';
import {useEffect, useState} from 'react';
import {useBlongUi} from '../context/BlongUiContext.js';
import {dropdownRegistry} from '../model/dropdownRegistry.js';
import type {IWidgetProps} from '../types/widget.js';

export function DropdownTreeWidget({
    id,
    name,
    schema,
    value,
    onChange,
    onBlur,
    error,
    readOnly,
    disabled,
}: IWidgetProps) {
    const {fetch: fetchAction, options: staticOptions, dropdown: dropdownKey} = schema.widget ?? {};
    const {dispatch} = useBlongUi();
    const [options, setOptions] = useState<unknown[]>(staticOptions ?? []);

    useEffect(() => {
        if (staticOptions) return;
        let cancelled = false;

        if (dropdownKey) {
            const loader = (key: string) =>
                (
                    dispatch('portal.dropdown.list', {names: [key]}) as Promise<
                        Record<string, unknown>
                    >
                ).then(result => result[key] as unknown[]);
            dropdownRegistry
                .get(dropdownKey, loader as Parameters<typeof dropdownRegistry.get>[1])
                .then(data => {
                    if (!cancelled) setOptions(data as unknown[]);
                })
                .catch(() => {});
            return () => {
                cancelled = true;
            };
        }

        if (!fetchAction) return;
        (dispatch(fetchAction, {}) as Promise<unknown[]>)
            .then(data => {
                if (!cancelled) setOptions(Array.isArray(data) ? data : []);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [fetchAction, dropdownKey, dispatch, staticOptions]);

    return (
        <TreeSelect
            inputId={id ?? name}
            data-testid={id ?? name}
            value={value == null ? null : String(value)}
            options={options as TreeNode[]}
            onChange={e => onChange(e.value ?? null)}
            onHide={onBlur}
            disabled={disabled || readOnly}
            className={`blong-dropdown-tree w-full ${error ? 'p-invalid' : ''}`}
            placeholder={schema.placeholder ?? 'Select…'}
        />
    );
}
