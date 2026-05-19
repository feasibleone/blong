/**
 * Navigator — tree view for hierarchical data navigation.
 * Typically placed on the left side of an Explorer.
 */
import {Tree, type TreeNode} from '../../primereact/index.js';
import React, {useState} from 'react';

interface INavigatorProps {
    /** Fetch function returning tree nodes */
    fetch?: () => Promise<Record<string, unknown[]>>;
    /** Called with the selected node value */
    onSelect?: (node: Record<string, unknown> | null) => void;
    keyField?: string;
    parentField?: string;
    field?: string;
    title?: string;
    /** Expected key in fetch result */
    resultSet?: string;
    /** Data passed directly (alternative to fetch) */
    data?: Record<string, unknown>[];
    className?: string;
}

function buildTree(
    items: Record<string, unknown>[],
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

export function Navigator({
    data: staticData,
    fetch: fetchFn,
    onSelect,
    keyField = 'id',
    parentField = 'parentId',
    field = 'name',
    title,
    resultSet,
    className,
}: INavigatorProps) {
    const [treeData, setTreeData] = useState<TreeNode[]>(() => {
        if (staticData) return buildTree(staticData, keyField, parentField, field);
        return [];
    });
    const [loading, setLoading] = useState(false);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);

    React.useEffect(() => {
        if (!fetchFn) return;
        // eslint-disable-next-line @eslint-react/set-state-in-effect
        setLoading(true);
        void fetchFn()
            .then(result => {
                const items = resultSet
                    ? (result[resultSet] as Record<string, unknown>[])
                    : (Object.values(result)[0] as Record<string, unknown>[]);
                setTreeData(buildTree(items ?? [], keyField, parentField, field));
            })
            .finally(() => setLoading(false));
    }, [fetchFn, keyField, parentField, field, resultSet]);

    return (
        <div className={`blong-navigator ${className ?? ''}`}>
            {title && <h4 className="blong-navigator__title">{title}</h4>}
            <Tree
                value={treeData}
                loading={loading}
                selectionKeys={selectedKey ?? undefined}
                onSelectionChange={e => {
                    const key = e.value as string;
                    setSelectedKey(key);
                    // Find the node data
                    const findNode = (nodes: TreeNode[]): TreeNode | undefined => {
                        for (const n of nodes) {
                            if (n.key === key) return n;
                            const found = findNode(n.children ?? []);
                            if (found) return found;
                        }
                    };
                    const node = findNode(treeData);
                    onSelect?.((node?.data as Record<string, unknown>) ?? null);
                }}
                className="blong-navigator__tree"
                filter
                filterPlaceholder="Search..."
            />
        </div>
    );
}
