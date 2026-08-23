/**
 * Navigator — tree view for hierarchical data navigation.
 * Typically placed on the left side of an Explorer or the commander shell.
 *
 * Commander enhancements: lazy per-node children (`loadChildren`), controlled
 * `expandedKeys` / `onToggle`, permission pruning (`permissionField`) and
 * start-at-a-branch (`startKey`).
 *
 * Drill-path mirroring (used by the Commander): nodes track their parent
 * (`__parentKey` in `data`), the imperative `selectPath()` reveals (materializes
 * + expands + selects) a root→node path, and `onSelectPath` reports the full
 * path of the currently selected node — so a shell can mirror the tree like a
 * file explorer and offer "go to parent" navigation.
 */
import {Tree, type TreeNode} from '../../primereact/index.js';
import React, {
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
import {useAppStore} from '../../state/appStore.js';

/** One step of a tree path (root → node). `key`/`label` are tree keys/labels. */
export interface INavigatorPathItem {
    key: string;
    label: string;
    data: Record<string, unknown>;
}

/** Imperative handle — lets a shell drive the tree (drill / go-up / reveal). */
export interface INavigatorHandle {
    /** Reveal (materialize + expand + select) a root→node path. */
    selectPath: (path: INavigatorPathItem[]) => Promise<void>;
    /**
     * Resolve a "/"-joined label path to a root→node path (materializing lazy
     * children as needed) and reveal it. Returns false when a label doesn't match.
     */
    jumpTo: (labels: string[]) => Promise<boolean>;
}

export interface INavigatorProps {
    /** Fetch function returning tree nodes */
    fetch?: () => Promise<Record<string, unknown[]>>;
    /** Lazy child fetch — called when a node is expanded and has no children yet */
    loadChildren?: (node: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
    /** Called with the selected node value */
    onSelect?: (node: Record<string, unknown> | null) => void;
    /** Called with the full root→selected path (empty when nothing is selected). */
    onSelectPath?: (path: INavigatorPathItem[]) => void;
    keyField?: string;
    parentField?: string;
    field?: string;
    title?: string;
    /** Expected key in fetch result */
    resultSet?: string;
    /** Data passed directly (alternative to fetch) */
    data?: Record<string, unknown>[];
    /** Controlled expanded keys (object keyed by node key) */
    expandedKeys?: Record<string, boolean>;
    /** Called when the expanded set changes */
    onToggle?: (keys: Record<string, boolean>) => void;
    /** Node field holding the permission name; nodes without access are pruned */
    permissionField?: string;
    /** Node key to select + expand on mount (start at a branch) */
    startKey?: string;
    /** Mark nodes as tree leaves (no expander) based on their data */
    isLeaf?: (node: Record<string, unknown>) => boolean;
    /** Inline style for the underlying PrimeReact Tree (e.g. border/padding). */
    treeStyle?: React.CSSProperties;
    className?: string;
    /** React 19 ref-as-prop — imperative handle for driving the tree. */
    ref?: React.Ref<INavigatorHandle>;
}

function buildTree(
    items: Record<string, unknown>[],
    keyField: string,
    parentField: string,
    labelField: string,
    isLeaf?: (node: Record<string, unknown>) => boolean,
): TreeNode[] {
    const roots: TreeNode[] = [];
    const map = new Map<unknown, TreeNode>();

    for (const item of items) {
        const node: TreeNode = {
            key: String(item[keyField]),
            label: String(item[labelField] ?? item[keyField]),
            data: item,
            children: [],
            // PrimeReact only renders the expander for empty-children nodes when
            // `leaf === false` — force it explicitly so lazy-loadable nodes show
            // an arrow (and expand without triggering drill-down/selection).
            ...(isLeaf ? {leaf: isLeaf(item)} : {}),
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
            // Record the parent so a selected node's full path can be walked.
            node.data = {...(node.data as object), __parentKey: String(parent.key)};
            parent.children = [...(parent.children ?? []), node];
        }
    }

    return roots;
}

/** Recursively drop nodes whose permission is not granted. */
function filterTree(
    nodes: TreeNode[],
    permissionField: string | undefined,
    canShow: (permission?: unknown) => boolean,
): TreeNode[] {
    const result: TreeNode[] = [];
    for (const node of nodes) {
        const permission = permissionField
            ? (node.data as Record<string, unknown> | undefined)?.[permissionField]
            : undefined;
        if (!canShow(permission)) continue;
        const children = filterTree(node.children ?? [], permissionField, canShow);
        result.push({...node, children});
    }
    return result;
}

/** Return a new tree with the node at `key` having `children` attached. */
function updateNodeChildren(
    nodes: TreeNode[],
    key: string,
    children: TreeNode[],
): TreeNode[] {
    return nodes.map(node => {
        if (node.key === key) return {...node, children};
        if (node.children?.length)
            return {...node, children: updateNodeChildren(node.children, key, children)};
        return node;
    });
}

/** Depth-first lookup of a node by key. */
function findNode(nodes: TreeNode[], key: string): TreeNode | undefined {
    for (const node of nodes) {
        if (node.key === key) return node;
        const found = findNode(node.children ?? [], key);
        if (found) return found;
    }
    return undefined;
}

export function Navigator({
        data: staticData,
        fetch: fetchFn,
        loadChildren,
        onSelect,
        onSelectPath,
        keyField = 'id',
        parentField = 'parentId',
        field = 'name',
        title,
        resultSet,
        permissionField,
        startKey,
        expandedKeys: expandedKeysProp,
        onToggle,
        isLeaf,
        treeStyle,
        className,
        ref,
    }: INavigatorProps) {
    const [treeData, setTreeData] = useState<TreeNode[]>(() =>
        staticData ? buildTree(staticData, keyField, parentField, field, isLeaf) : [],
    );
    // Latest tree mirror so async materialization (`selectPath`) never reads a
    // stale snapshot while awaiting a `loadChildren` fetch.
    const treeRef = useRef<TreeNode[]>(treeData);
    // key → TreeNode index, kept in sync with `treeData` (parent walking).
    const nodeMapRef = useRef(new Map<string, TreeNode>());
    const setTree = useCallback((next: TreeNode[]) => {
        treeRef.current = next;
        setTreeData(next);
    }, []);
    const [loading, setLoading] = useState(false);
    const [selectedKey, setSelectedKey] = useState<string | null>(startKey ?? null);
    const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>(
        startKey ? {[startKey]: true} : {},
    );

    useEffect(() => {
        const map = new Map<string, TreeNode>();
        const walk = (nodes: TreeNode[]) => {
            for (const node of nodes) {
                map.set(String(node.key), node);
                walk(node.children ?? []);
            }
        };
        walk(treeData);
        nodeMapRef.current = map;
    }, [treeData]);

    const permissions = useAppStore(s => s.auth.permissions);
    const canShow = useCallback(
        (permission?: unknown) => {
            if (permission === undefined || permission === null || permission === '') return true;
            if (typeof permissions === 'boolean') return permissions;
            return (permissions as Record<string, boolean>)[String(permission)] === true;
        },
        [permissions],
    );

    // Prune permission-denied nodes before rendering.
    const visibleTree = useMemo(
        () => filterTree(treeData, permissionField, canShow),
        [treeData, permissionField, canShow],
    );

    React.useEffect(() => {
        if (!fetchFn) return;
        // eslint-disable-next-line @eslint-react/set-state-in-effect
        setLoading(true);
        void fetchFn()
            .then(result => {
                const items = resultSet
                    ? (result[resultSet] as Record<string, unknown>[])
                    : (Object.values(result)[0] as Record<string, unknown>[]);
                setTree(buildTree(items ?? [], keyField, parentField, field, isLeaf));
            })
            .finally(() => setLoading(false));
    }, [fetchFn, keyField, parentField, field, resultSet, isLeaf, setTree]);

    const loadChildrenForKey = useCallback(
        (key: string) => {
            if (!loadChildren) return;
            const node = findNode(treeData, key);
            if (!node || (node.children?.length ?? 0) > 0) return;
            void loadChildren(node.data as Record<string, unknown>).then(children => {
                const built = buildTree(children ?? [], keyField, parentField, field, isLeaf).map(
                    child => ({...child, data: {...(child.data as object), __parentKey: String(node.key)}}),
                );
                setTree(updateNodeChildren(treeData, key, built));
            });
        },
        [loadChildren, treeData, keyField, parentField, field, isLeaf, setTree],
    );

    /** Walk up the `__parentKey` chain to build the root→node path. */
    const pathForKey = useCallback((key: string): INavigatorPathItem[] => {
        const path: INavigatorPathItem[] = [];
        let cur = nodeMapRef.current.get(key);
        while (cur) {
            path.unshift({
                key: String(cur.key),
                label: String(cur.label ?? cur.key),
                data: (cur.data as Record<string, unknown>) ?? {},
            });
            const parentKey = (cur.data as Record<string, unknown> | undefined)?.['__parentKey'];
            cur = typeof parentKey === 'string' ? nodeMapRef.current.get(parentKey) : undefined;
        }
        return path;
    }, []);

    /**
     * Reveal a root→node path: lazily materialize each node's children so the
     * tree mirrors the drill (file-explorer style), expand every path node and
     * select the deepest one.
     */
    const selectPath = useCallback(
        async (path: INavigatorPathItem[]) => {
            if (!path.length) {
                setSelectedKey(null);
                onSelectPath?.([]);
                return;
            }
            let tree = treeRef.current;
            for (const item of path) {
                const node = findNode(tree, item.key);
                if (!node) return; // ancestor not materialized — nothing to reveal
                if (!node.leaf && (node.children?.length ?? 0) === 0) {
                    const children = (await loadChildren?.(node.data as Record<string, unknown>)) ?? [];
                    const built = buildTree(children, keyField, parentField, field, isLeaf).map(
                        child => ({...child, data: {...(child.data as object), __parentKey: String(node.key)}}),
                    );
                    tree = updateNodeChildren(tree, item.key, built);
                    setTree(tree);
                }
            }
            setExpandedKeys(prev => ({
                ...prev,
                ...Object.fromEntries(path.map(p => [p.key, true])),
            }));
            const last = path[path.length - 1];
            setSelectedKey(last.key);
            onSelectPath?.(path);
        },
        [loadChildren, keyField, parentField, field, isLeaf, onSelectPath, setTree],
    );

    /**
     * Resolve a label path (e.g. `['Kubernetes (dev)', 'prod', 'deploy']`) to a
     * root→node path, materializing lazy children level-by-level, then reveal it.
     * Returns false when any label fails to match.
     */
    const jumpTo = useCallback(
        async (labels: string[]): Promise<boolean> => {
            if (!labels.length) return true;
            const path: INavigatorPathItem[] = [];
            let nodes = treeRef.current;
            for (let i = 0; i < labels.length; i++) {
                const target = labels[i].trim().toLowerCase();
                const found = nodes.find(n => String(n.label).trim().toLowerCase() === target);
                if (!found) return false;
                path.push({
                    key: String(found.key),
                    label: String(found.label),
                    data: (found.data as Record<string, unknown>) ?? {},
                });
                if (i < labels.length - 1) {
                    let children = found.children ?? [];
                    if (children.length === 0 && !found.leaf) {
                        const kids = (await loadChildren?.(found.data as Record<string, unknown>)) ?? [];
                        children = buildTree(kids, keyField, parentField, field, isLeaf).map(child => ({
                            ...child,
                            data: {...(child.data as object), __parentKey: String(found.key)},
                        }));
                        const next = updateNodeChildren(treeRef.current, String(found.key), children);
                        treeRef.current = next;
                        setTree(next);
                    }
                    nodes = children;
                }
            }
            await selectPath(path);
            return true;
        },
        [loadChildren, keyField, parentField, field, isLeaf, selectPath, setTree],
    );

    useImperativeHandle(ref, () => ({selectPath, jumpTo}), [selectPath, jumpTo]);

    const handleToggle = useCallback(
        (e: {value: Record<string, boolean>}) => {
            const next = e.value;
            const newly = Object.keys(next).filter(key => next[key] && !expandedKeys[key]);
            setExpandedKeys(next);
            onToggle?.(next);
            for (const key of newly) loadChildrenForKey(key);
        },
        [expandedKeys, onToggle, loadChildrenForKey],
    );

    const controlledExpanded = expandedKeysProp ?? expandedKeys;

    return (
        <div className={`blong-navigator ${className ?? ''}`}>
            {title && <h4 className="blong-navigator__title">{title}</h4>}
            <Tree
                value={visibleTree}
                loading={loading}
                selectionMode="single"
                selectionKeys={selectedKey ?? undefined}
                onSelectionChange={e => {
                    const key = (e.value as string) ?? null;
                    setSelectedKey(key);
                    // Find the node data
                    const node = key ? nodeMapRef.current.get(key) : undefined;
                    onSelect?.((node?.data as Record<string, unknown>) ?? null);
                    onSelectPath?.(key ? pathForKey(key) : []);
                }}
                expandedKeys={controlledExpanded}
                onToggle={handleToggle}
                className="blong-navigator__tree"
                style={treeStyle}
            />
        </div>
    );
}
