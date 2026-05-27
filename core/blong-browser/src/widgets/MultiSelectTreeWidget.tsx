import type {IWidgetProps} from '@feasibleone/blong';
import {useEffect, useState} from 'react';
import {useBlong} from '../context/BlongContext.js';
import {dropdownRegistry} from '../model/dropdownRegistry.js';
import {TreeSelect, type TreeNode} from '../primereact/index.js';

export function MultiSelectTreeWidget({
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
    const {handler} = useBlong();
    const [options, setOptions] = useState<unknown[]>(staticOptions ?? []);

    useEffect(() => {
        if (staticOptions) return;
        let cancelled = false;

        if (dropdownKey) {
            const loader = (key: string) =>
                (
                    handler.portalDropdownList({names: [key]}, {}) as Promise<
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
        (handler[fetchAction]({}, {}) as Promise<unknown[]>)
            .then(data => {
                if (!cancelled) setOptions(Array.isArray(data) ? data : []);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [fetchAction, dropdownKey, handler, staticOptions]);

    // TreeSelect multi value: {[key]: true} ↔ string[]
    const arrValue = Array.isArray(value) ? (value as string[]) : [];
    const treeValue = Object.fromEntries(arrValue.map(v => [v, true])) as Record<string, boolean>;

    return (
        <TreeSelect
            inputId={id ?? name}
            data-testid={id ?? name}
            value={treeValue}
            options={options as TreeNode[]}
            selectionMode="multiple"
            display="chip"
            metaKeySelection={false}
            onChange={e =>
                onChange(e.value && typeof e.value === 'object' ? Object.keys(e.value) : [])
            }
            onHide={onBlur}
            disabled={disabled || readOnly}
            className={`blong-multiselect-tree w-full ${error ? 'p-invalid' : ''}`}
            placeholder={schema.placeholder ?? 'Select…'}
        />
    );
}
