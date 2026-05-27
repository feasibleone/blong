import type {IWidgetProps} from '@feasibleone/blong';
import {useEffect, useState} from 'react';
import {useBlong} from '../context/BlongContext.js';
import {dropdownRegistry} from '../model/dropdownRegistry.js';
import {Column, TreeTable, type TreeNode} from '../primereact/index.js';

export function MultiSelectTreeTableWidget({
    id,
    name,
    schema,
    value,
    onChange,
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

    return (
        <TreeTable
            data-testid={id ?? name}
            value={options as TreeNode[]}
            selectionKeys={value as Record<string, {checked?: boolean; partialChecked?: boolean}>}
            onSelectionChange={e => onChange(e.value ?? null)}
            selectionMode="checkbox"
            disabled={disabled || readOnly}
            className={`blong-multiselect-tree-table w-full ${error ? 'p-invalid' : ''}`}
        >
            <Column
                expander
                body={(node: TreeNode) => (node as Record<string, unknown>).label as string}
            />
        </TreeTable>
    );
}
