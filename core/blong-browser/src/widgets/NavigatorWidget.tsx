/**
 * NavigatorWidget — tree navigator widget.
 *
 * Wraps the Navigator component as a schema-driven widget. Data is loaded
 * from `widget.listAction` (or supplied as the field value). Selection is
 * published via the `onSelect` prop so sibling table widgets can cascade-
 * filter using `widget.parent` / `widget.master`.
 *
 * Schema config:
 *   widget.type: 'navigator'
 *   widget.listAction   — action name to load tree nodes
 *   widget.resultSet    — response property containing rows (default 'items')
 *   widget.keyField     — primary key field (default 'id')
 *   widget.parentField  — parent key field (default 'parentId')
 *   widget.labelField   — display label field (default 'name')
 *   widget.label        — panel title
 */
import type {IWidgetProps} from '@feasibleone/blong';
import React, {useEffect, useState} from 'react';
import {useBlongUi} from '../context/BlongUiContext.js';
import {Tree, type TreeNode} from '../primereact/index.js';

type Row = Record<string, unknown>;

function buildTree(
    items: Row[],
    keyField: string,
    parentField: string,
    labelField: string,
): TreeNode[] {
    const roots: TreeNode[] = [];
    const map = new Map<unknown, TreeNode>();

    for (const item of items) {
        const node: TreeNode = {
            key: String(item[keyField]),
            label: String(item[labelField] ?? item[keyField]),
            data: item,
            children: [],
        };
        map.set(item[keyField], node);
    }

    for (const item of items) {
        const parentKey = item[parentField];
        const node = map.get(item[keyField])!;
        if (parentKey == null || !map.has(parentKey)) {
            roots.push(node);
        } else {
            const parent = map.get(parentKey)!;
            parent.children = [...(parent.children ?? []), node];
        }
    }

    return roots;
}

export function NavigatorWidget({name, schema, value, onSelect}: IWidgetProps) {
    const {dispatch} = useBlongUi();

    const widget = schema.widget;
    const listAction = widget?.listAction ?? '';
    const resultSet = widget?.resultSet ?? 'items';
    const keyField = widget?.keyField ?? 'id';
    const parentField = widget?.parentField ?? 'parentId';
    const labelField = widget?.labelField ?? 'name';
    const title = widget?.label;
    const log = useBlongUi().log;

    // Use field value as static data when listAction is not set
    const staticRows = !listAction && Array.isArray(value) ? (value as Row[]) : undefined;

    const [treeData, setTreeData] = useState<TreeNode[]>(() => {
        if (staticRows) return buildTree(staticRows, keyField, parentField, labelField);
        return [];
    });
    const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>(() => {
        if (staticRows) {
            const keys: Record<string, boolean> = {};
            for (const item of staticRows) {
                if (item[parentField] == null) {
                    keys[String(item[keyField])] = true;
                }
            }
            return keys;
        }
        return {};
    });
    const setTreeDataAndExpand = React.useCallback(
        async (items: Row[]) => {
            const data: TreeNode[] = buildTree(items, keyField, parentField, labelField);
            setTreeData(data);
            setExpandedKeys(
                data.reduce(
                    (acc, node) => ({...acc, [String(node.key)]: true}),
                    {} as Record<string, boolean>,
                ),
            );
            if (items.length) {
                const firstKey = String(items[0][keyField]);
                setSelectedKey(firstKey);
                onSelect?.(name, {row: items[0], index: 0});
            }
        },
        [keyField, parentField, labelField, name, onSelect],
    );
    const [loading, setLoading] = useState(false);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);

    useEffect(() => {
        if (!listAction) return;
        setLoading(true);
        const params = widget?.listParams ?? {};
        void (dispatch(listAction, params) as Promise<Record<string, unknown>>)
            .then(result => {
                let items: Row[];
                if (resultSet && Array.isArray((result as Record<string, unknown>)[resultSet])) {
                    items = (result as Record<string, unknown>)[resultSet] as Row[];
                } else if (Array.isArray(result)) {
                    items = result as Row[];
                } else {
                    // Try first array property as a fallback, warn if used
                    const firstArray = Object.values(result as Record<string, unknown>).find(v =>
                        Array.isArray(v),
                    );
                    if (firstArray) {
                        log?.warn?.(
                            `[NavigatorWidget] listAction "${listAction}" did not return expected resultSet "${resultSet}"; using first array property.`,
                        );
                        items = firstArray as Row[];
                    } else {
                        items = [];
                    }
                }
                setTreeDataAndExpand(items).catch(err => {
                    log?.error?.('[NavigatorWidget] Error setting tree data:', err);
                });
            })
            .finally(() => setLoading(false));
    }, [
        listAction,
        widget?.listParams,
        resultSet,
        keyField,
        parentField,
        labelField,
        dispatch,
        setTreeDataAndExpand,
        log,
    ]);

    // Sync static data changes
    useEffect(() => {
        if (staticRows) {
            setTreeDataAndExpand(staticRows).catch(err => {
                log?.error?.('[NavigatorWidget] Error setting tree data:', err);
            });
        }
    }, [staticRows, setTreeDataAndExpand, log]);

    const handleSelection = (key: string | null) => {
        setSelectedKey(key);
        const findNode = (nodes: TreeNode[]): TreeNode | undefined => {
            for (const n of nodes) {
                if (n.key === key) return n;
                const found = findNode(n.children ?? []);
                if (found) return found;
            }
        };
        const node = key ? findNode(treeData) : undefined;
        // Publish selection as {row, index: 0} via onSelect so sibling table widgets
        // can cascade-filter using widget.parent / widget.master
        onSelect?.(name, node ? {row: node.data as Row, index: 0} : null);
    };

    return (
        <div
            className="blong-navigator w-full"
            style={{height: '100%', display: 'flex', flexDirection: 'column'}}
        >
            {title && <h4 className="blong-navigator__title">{title}</h4>}
            <Tree
                value={treeData}
                expandedKeys={expandedKeys}
                onToggle={e => setExpandedKeys(e.value)}
                loading={loading}
                selectionMode="single"
                selectionKeys={selectedKey ?? undefined}
                onSelectionChange={e => handleSelection(e.value as string | null)}
                className="border-none p-0 blong-navigator__tree"
                // filter # disabled due to interfering with expandedKeys state; would need to reset expandedKeys on filter change to work properly
                filterPlaceholder="Search…"
                style={{flex: 1, overflow: 'auto'}}
            />
        </div>
    );
}
