/**
 * Commander — universal backend explorer shell (blong-commander).
 *
 * Layout: left hierarchy tree (sources → branches, lazily loaded via source
 * descriptors), right children table of the selected node or a leaf viewer,
 * and a breadcrumb path bar. Keyboard-driven via `useCommanderNav`.
 *
 * The generic protocol: the UI only calls the triples declared on each level's
 * `list`/`open` (semantic triples routed to the configured adapters). Phase 3
 * (`core/blong-commander` realm) supplies `commander.source.list` and the
 * concrete source descriptors.
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
    Button,
    Column,
    DataTable,
    Dropdown,
    InputText,
    SelectButton,
    Splitter,
    SplitterPanel,
} from '../../primereact/index.js';
import {useBlong} from '../../context/BlongContext.js';
import {useCommanderNav} from '../../hooks/useCommanderNav.js';
import {Navigator, type INavigatorHandle, type INavigatorPathItem} from '../Navigator/Navigator.js';
import {PathBar} from './PathBar.js';
import {registerBuiltinViewers} from '../../viewers/index.js';
import {resolveViewer, type ICommanderModelRef} from '../../viewers/resolveViewer.js';

// Ensure the generic viewers (json/keyValue/file/image/podLog) are registered.
registerBuiltinViewers();

export interface ICommanderLevel {
    resourceType: string;
    label?: string;
    keyField?: string;
    labelField?: string;
    viewer?: string;
    permission?: string;
    model?: ICommanderModelRef;
    /** Triple + params that list the children of this level's nodes. */
    list: {
        method: string;
        resultSet?: string;
        params?:
            | Record<string, unknown>
            | ((parent: Record<string, unknown> | null) => Record<string, unknown>);
    };
    /** Triple + params that open a node (leaf viewer fetch). */
    open?: {
        method: string;
        params?: Record<string, unknown>;
    };
}

export interface ICommanderSource {
    name: string;
    label: string;
    icon?: string;
    permission?: string;
    levels: ICommanderLevel[];
}

interface ISelectedNode {
    source: ICommanderSource;
    levelIndex: number; // -1 = the source root
    node: Record<string, unknown>;
}

/** One step of the current drill path (source root → selected node). */
interface IPathEntry extends ISelectedNode {
    /** Tree key of this node (path-joined, matches the navigator tree). */
    key: string;
    label: string;
}

export interface ICommanderProps {
    /** Configured source descriptors (see `core/blong-commander`). */
    sources: ICommanderSource[];
    /** Custom children loader (overrides the default handler[method] call). */
    listChildren?: (
        level: ICommanderLevel,
        parent: Record<string, unknown> | null,
    ) => Promise<Record<string, unknown>[]>;
    /** Custom node getter for leaf viewers. */
    getNode?: (level: ICommanderLevel, node: Record<string, unknown>) => Promise<unknown>;
    /** Model refs for model-system recognition (`{subject}.{object}`). */
    models?: ICommanderModelRef[];
    /** Show a ".." up-to-parent row at the top of the table (config-toggleable). */
    showParentRow?: boolean;
    className?: string;
}

/** Right-panel view style. */
type CommanderView = 'table' | 'grid';

const INTERNAL_FIELDS = new Set([
    'sourceName',
    'levelIndex',
    'source',
    'label',
    '__treeKey',
    '__treeLabel',
    '__parentKey',
]);

/** `parent.*` context keys stamped on rows for `{parent.X}` open resolution. */
function isInternalField(key: string): boolean {
    return INTERNAL_FIELDS.has(key) || key.startsWith('parent.');
}

function humanize(key: string): string {
    return key
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

/** Tree key separator — `::` is unlikely to appear in backend key values. */
const TREE_KEY_SEP = '::';

/** The display key of a level node (its `keyField` value). */
function childKey(level: ICommanderLevel, child: Record<string, unknown>): string {
    const raw =
        child[level.keyField ?? 'id'] ?? child.__treeKey ?? child.name ?? child.id ?? child.key;
    if (raw !== undefined && raw !== null) return String(raw);
    // Same display-value heuristic as `childLabel` so each row gets a unique key
    // (e.g. `emailAddress`, `userId`) instead of a shared "node".
    const nameKey = Object.keys(child).find(k => !isInternalField(k) && (/name$/i.test(k) || /email/i.test(k)));
    if (nameKey && child[nameKey] != null) return String(child[nameKey]);
    const idKey = Object.keys(child).find(k => !isInternalField(k) && /id$/i.test(k));
    if (idKey && child[idKey] != null) return String(child[idKey]);
    return 'node';
}

/** The display label of a level node (its `labelField`/`keyField` value). */
function childLabel(level: ICommanderLevel, child: Record<string, unknown>): string {
    const raw =
        child[level.labelField ?? ''] ??
        child[level.keyField ?? 'id'] ??
        child.name ??
        child.label ??
        child.id ??
        child.key;
    if (raw !== undefined && raw !== null) return String(raw);
    // Fall back to a field that looks like a display value — `*Name`/`*email`
    // (e.g. `userName`, `metadata.name`, `emailAddress`), else an `*Id` — so
    // generic table rows get a readable label instead of "node".
    const nameKey = Object.keys(child).find(k => !isInternalField(k) && (/name$/i.test(k) || /email/i.test(k)));
    if (nameKey && child[nameKey] != null) return String(child[nameKey]);
    const idKey = Object.keys(child).find(k => !isInternalField(k) && /id$/i.test(k));
    if (idKey && child[idKey] != null) return String(child[idKey]);
    return String(childKey(level, child));
}

/** Path-join a child's key under its parent tree key. */
function joinKey(parentKey: string, key: string): string {
    return `${parentKey}${TREE_KEY_SEP}${key}`;
}

/**
 * Stamp the parent's REAL fields onto a child row as `parent.<field>` so leaf
 * `open` param templates like `{parent.path}` / `{parent.metadata.name}`
 * resolve in `commander.node.get` (which only receives the leaf node). Only the
 * direct parent's own fields are stamped — any inherited `parent.*` context is
 * dropped so the keys don't accumulate (`parent.parent.*`) across levels.
 */
function withParentContext(
    parent: Record<string, unknown> | null | undefined,
    child: Record<string, unknown>,
): Record<string, unknown> {
    if (!parent) return child;
    const parentFields = Object.fromEntries(
        Object.entries(parent)
            .filter(([key]) => !key.startsWith('parent.') && !INTERNAL_FIELDS.has(key))
            .map(([key, value]) => [`parent.${key}`, value]),
    );
    return {...parentFields, ...child};
}

/** Strip the internal `parent.*`/`__*` context fields for clean viewer display. */
function cleanLeafNode(node: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(node).filter(([key]) => !isInternalField(key) && !key.startsWith('__')),
    );
}

export function Commander({
    sources,
    listChildren: listChildrenProp,
    getNode: getNodeProp,
    models,
    showParentRow = true,
    className,
}: ICommanderProps) {
    const {handler} = useBlong();
    // The drill path (source root → selected node). `selected` = last entry.
    const [path, setPath] = useState<IPathEntry[]>([]);
    const [viewerNode, setViewerNode] = useState<ISelectedNode | null>(null);
    const [rows, setRows] = useState<Record<string, unknown>[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [helpOpen, setHelpOpen] = useState(false);
    const [currentRow, setCurrentRow] = useState<Record<string, unknown> | null>(null);
    // Navigation history (Windows-Explorer back/forward) over the drill paths.
    const [view, setView] = useState<CommanderView>('table');
    const [sortField, setSortField] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<1 | -1>(1);
    const [history, setHistory] = useState<IPathEntry[][]>([[]]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const historyRef = useRef<IPathEntry[][]>([[]]);
    const historyIndexRef = useRef(0);
    const suppressHistoryRef = useRef(false);
    const navigatorRef = useRef<INavigatorHandle>(null);
    const searchRef = useRef<HTMLDivElement>(null);
    // Guards `loadRows` against out-of-order async resolutions: only the LATEST
    // navigation's fetch may write `rows` (a slow previous branch must never
    // overwrite the current one — "keeps showing the db data").
    const loadTokenRef = useRef(0);

    const selected: IPathEntry | null = path.length ? path[path.length - 1] : null;
    const canGoBack = historyIndex > 0;
    const canGoForward = historyIndex < history.length - 1;

    const defaultListChildren = useCallback(
        async (_level: ICommanderLevel, parent: Record<string, unknown> | null) => {
            const source = parent?.sourceName as string | undefined;
            if (!source) return [];
            const levelIndex = (parent?.levelIndex as number) ?? -1;
            const result = await handler['commander.branch.list'](
                {
                    source,
                    level: levelIndex,
                    ...(levelIndex >= 0 ? {parent: parent ?? undefined} : {}),
                },
                {},
            );
            return ((result as {items?: unknown[]})?.items ?? []) as Record<string, unknown>[];
        },
        [handler],
    );
    const listChildren = listChildrenProp ?? defaultListChildren;

    const defaultGetNode = useCallback(
        async (_level: ICommanderLevel, node: Record<string, unknown>) => {
            const source = node.sourceName as string | undefined;
            const level = node.levelIndex as number | undefined;
            if (!source || level === undefined) return node;
            return handler['commander.node.get']({source, level, node}, {});
        },
        [handler],
    );
    const getNode = getNodeProp ?? defaultGetNode;

    // ── Tree wiring ──────────────────────────────────────────────────────────
    const sourceFor = useCallback(
        (name?: string) => sources.find(source => source.name === name),
        [sources],
    );

    const isLeaf = useCallback(
        (data: Record<string, unknown>) => {
            const source = sourceFor(data.sourceName as string);
            if (!source) return true;
            const levelIndex = (data.levelIndex as number) ?? 0;
            return levelIndex >= source.levels.length - 1;
        },
        [sourceFor],
    );

    const loadTreeChildren = useCallback(
        async (nodeData: Record<string, unknown>): Promise<Record<string, unknown>[]> => {
            const source = sourceFor(nodeData.sourceName as string);
            if (!source) return [];
            const levelIndex = (nodeData.levelIndex as number) ?? -1;
            const next = levelIndex + 1;
            if (next >= source.levels.length) return [];
            const level = source.levels[next];
            // `nodeData` always carries `sourceName` + `levelIndex`, so it works as
            // the parent even at the source root (levelIndex -1) — otherwise
            // `defaultListChildren` can't resolve the source when the parent is null.
            const parentKey =
                (nodeData.__treeKey as string) ??
                String(nodeData.name ?? nodeData.sourceName ?? 'source');
            const parent = nodeData;
            const children = await listChildren(level, parent);
            return children.map(child =>
                withParentContext(parent, {
                    ...child,
                    sourceName: source.name,
                    levelIndex: next,
                    __treeKey: joinKey(parentKey, childKey(level, child)),
                    __treeLabel: childLabel(level, child),
                }),
            );
        },
        [sourceFor, listChildren],
    );

    const treeRoots = useMemo(
        () =>
            sources.map(source => ({
                ...source,
                sourceName: source.name,
                levelIndex: -1,
                __treeKey: source.name,
                __treeLabel: source.label,
            })),
        [sources],
    );

    // ── Right panel: children of the selected node, or a leaf viewer ────────
    const loadRows = useCallback(async () => {
        // The home view has no table — the welcome panel is rendered instead.
        if (!selected) {
            setRows([]);
            return;
        }
        const token = ++loadTokenRef.current;
        const {source, levelIndex, node} = selected;
        const next = levelIndex + 1;
        if (next >= source.levels.length) return; // leaf → viewer handles it
        const level = source.levels[next];
        // At the source root (levelIndex -1) there is no real parent node, so hand
        // the loader a synthetic parent carrying `sourceName` + `levelIndex` —
        // otherwise `defaultListChildren` can't resolve the source and returns [].
        const parent = levelIndex >= 0 ? node : {sourceName: source.name, levelIndex: -1};
        // Drop the stale rows (e.g. the source list) immediately so the panel
        // never shows the previous branch while the new one is loading.
        setRows([]);
        setLoading(true);
        try {
            const children = await listChildren(level, parent);
            // A stale (out-of-order) fetch must not overwrite the current rows.
            if (token !== loadTokenRef.current) return;
            const parentKey = selected.key;
            setRows(
                children.map(child =>
                    withParentContext(parent, {
                        ...child,
                        sourceName: source.name,
                        levelIndex: next,
                        __treeKey: joinKey(parentKey, childKey(level, child)),
                        __treeLabel: childLabel(level, child),
                    }),
                ),
            );
        } finally {
            if (token === loadTokenRef.current) setLoading(false);
        }
    }, [selected, listChildren]);

    useEffect(() => {
        void loadRows();
    }, [loadRows]);

    const viewerFetch = useMemo(() => {
        if (!viewerNode) return undefined;
        const {source, levelIndex, node} = viewerNode;
        const level = source.levels[levelIndex];
        return () =>
            getNode(level, node).then(result => {
                // Levels without an `open` return the node itself (with internal
                // `parent.*`/`__*` context) — strip it so viewers show only data.
                if (result && typeof result === 'object' && !Array.isArray(result)) {
                    return cleanLeafNode(result as Record<string, unknown>);
                }
                return result;
            });
    }, [viewerNode, getNode]);

    const isViewerOpen = viewerNode !== null;

    /** Convert commander path entries into navigator path items (drill/up calls). */
    const toPathItem = useCallback(
        (entry: IPathEntry): INavigatorPathItem => ({
            key: entry.key,
            label: entry.label,
            data: entry.node,
        }),
        [],
    );

    /** Record a new drill path in the back/forward history (unless restoring). */
    const recordHistory = useCallback((next: IPathEntry[]) => {
        if (suppressHistoryRef.current) {
            suppressHistoryRef.current = false;
            return;
        }
        historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1).concat([next]);
        historyIndexRef.current = historyRef.current.length - 1;
        setHistory(historyRef.current);
        setHistoryIndex(historyIndexRef.current);
    }, []);

    /** Ask the tree to reveal a path (drill / up / breadcrumb / back / forward). */
    const navigateTo = useCallback((target: INavigatorPathItem[]) => {
        void navigatorRef.current?.selectPath(target);
    }, []);

    const goBack = useCallback(() => {
        if (historyIndexRef.current <= 0) return;
        suppressHistoryRef.current = true;
        historyIndexRef.current -= 1;
        setHistoryIndex(historyIndexRef.current);
        const target = historyRef.current[historyIndexRef.current];
        if (target) void navigatorRef.current?.selectPath(target.map(toPathItem));
    }, [toPathItem]);

    const goForward = useCallback(() => {
        if (historyIndexRef.current >= historyRef.current.length - 1) return;
        suppressHistoryRef.current = true;
        historyIndexRef.current += 1;
        setHistoryIndex(historyIndexRef.current);
        const target = historyRef.current[historyIndexRef.current];
        if (target) void navigatorRef.current?.selectPath(target.map(toPathItem));
    }, [toPathItem]);

    const refresh = useCallback(() => void loadRows(), [loadRows]);

    /** Convert a navigator-selected path into commander path entries. */
    const handleSelectPath = useCallback(
        (items: INavigatorPathItem[]) => {
            const entries: IPathEntry[] = [];
            for (const item of items) {
                const data = item.data;
                const source = sourceFor(data.sourceName as string);
                if (!source) continue;
                entries.push({
                    source,
                    levelIndex: (data.levelIndex as number) ?? -1,
                    node: data,
                    key: item.key,
                    label: item.label,
                });
            }
            // A leaf has no children to show — open its viewer instead.
            const last = entries[entries.length - 1];
            if (last && last.levelIndex >= last.source.levels.length - 1) {
                setViewerNode({source: last.source, levelIndex: last.levelIndex, node: last.node});
                const parentPath = entries.slice(0, -1);
                recordHistory(parentPath);
                setPath(parentPath);
                return;
            }
            setViewerNode(null);
            recordHistory(entries);
            setPath(entries);
        },
        [sourceFor, recordHistory],
    );

    /** Navigate up one level — or close the viewer when one is open. */
    const handleUp = useCallback(() => {
        if (viewerNode) {
            setViewerNode(null);
            return;
        }
        navigateTo(path.length <= 1 ? [] : path.slice(0, -1).map(toPathItem));
    }, [viewerNode, path, navigateTo, toPathItem]);

    const handleRowOpen = useCallback(
        (row: Record<string, unknown>) => {
            if ((row as {__parentUp?: boolean}).__parentUp) {
                handleUp();
                return;
            }
            const source = sourceFor(row.sourceName as string);
            if (!source) return;
            const levelIndex = (row.levelIndex as number) ?? -1;
            const level = source.levels[levelIndex];
            const parentKey = path.length ? path[path.length - 1].key : source.name;
            const treeKey = joinKey(parentKey, childKey(level, row));
            const label = childLabel(level, row);
            const item: INavigatorPathItem = {
                key: treeKey,
                label,
                data: {
                    ...row,
                    sourceName: source.name,
                    levelIndex,
                    __treeKey: treeKey,
                    __treeLabel: label,
                },
            };
            if (levelIndex >= source.levels.length - 1) {
                // leaf → reveal + focus it in the tree, which opens its viewer
                // (handleSelectPath's leaf branch opens the viewer for the last
                // path item). Keeping the leaf out of `path` so Up/.. return to
                // the branch that owns it.
                navigateTo([...path.map(toPathItem), item]);
                return;
            }
            // branch → drill down: reveal the node in the tree (which also selects
            // it and reloads the right panel with its children).
            navigateTo([...path.map(toPathItem), item]);
        },
        [sourceFor, path, navigateTo, toPathItem, handleUp],
    );

    const pathSegments = useMemo(() => {
        const segments: {key: string; label: string}[] = path.map(entry => ({
            key: entry.key,
            label: entry.label,
        }));
        if (viewerNode) {
            const {source, levelIndex, node} = viewerNode;
            const level = source.levels[levelIndex];
            const labelField = level.labelField ?? level.list.method.split('.').pop();
            const label =
                node[labelField ?? ''] ??
                node[level.keyField ?? 'id'] ??
                node.name ??
                node.label;
            segments.push({
                key: String(node[level.keyField ?? 'id'] ?? 'viewer'),
                label: String(label ?? 'Open'),
            });
        }
        return segments;
    }, [path, viewerNode]);

    const handlePathNavigate = useCallback(
        (index: number) => {
            setViewerNode(null);
            if (index < path.length) {
                navigateTo(path.slice(0, index + 1).map(toPathItem));
            }
        },
        [path, navigateTo, toPathItem],
    );

    /** Open the highlighted table row (F2 / toolbar Open button). */
    const handleOpen = useCallback(() => {
        if (currentRow) handleRowOpen(currentRow);
    }, [currentRow, handleRowOpen]);

    /** Jump to a "/"-joined label path in the tree (crumb-jump widget). */
    const handleJump = useCallback(
        (value: string) => {
            const labels = value
                .split('/')
                .map(s => s.trim())
                .filter(Boolean);
            if (!labels.length) return;
            void navigatorRef.current?.jumpTo(labels);
        },
        [navigatorRef],
    );

    // ── Keyboard ─────────────────────────────────────────────────────────────
    const {activePane, setActivePane, movePane} = useCommanderNav({
        onEscape: () => setHelpOpen(false),
        onBackspace: handleUp,
        onRefresh: refresh,
        onSearch: () => {
            setActivePane('table');
            requestAnimationFrame(() => searchRef.current?.querySelector('input')?.focus());
        },
        onHelp: () => setHelpOpen(open => !open),
        onOpen: () => {
            if (activePane !== 'table') return;
            handleOpen();
        },
    });

    const filteredRows = useMemo(() => {
        if (!search) return rows;
        const needle = search.toLowerCase();
        return rows.filter(row =>
            Object.entries(row).some(
                ([key, value]) =>
                    !isInternalField(key) &&
                    value != null &&
                    String(value).toLowerCase().includes(needle),
            ),
        );
    }, [rows, search]);

    // The field shown by the synthesized "Name" column — excluded from the
    // derived columns so it isn't rendered twice (Windows-Explorer style).
    const labelField = useMemo(() => {
        if (!selected) return 'name'; // home source rows → skip the source `name`
        const source = selected.source;
        const next = selected.levelIndex + 1;
        if (next >= source.levels.length) return null;
        return source.levels[next].labelField ?? source.levels[next].keyField ?? null;
    }, [selected]);

    const columns = useMemo(() => {
        const all = filteredRows.length > 0 ? filteredRows : rows;
        if (!all.length) return [];
        // A field becomes a column only when it is scalar in EVERY row — a single
        // object/array value (e.g. `{version}` in a later row) would make React
        // throw when rendering the cell.
        return Object.keys(all[0])
            .filter(key => !isInternalField(key))
            .filter(key => key !== labelField)
            .filter(key =>
                all.every(row => {
                    const value = row[key];
                    return (
                        value === null || value === undefined || typeof value !== 'object'
                    );
                }),
            )
            .slice(0, 8)
            .map(key => ({field: key, header: humanize(key)}));
    }, [filteredRows, rows, labelField]);

    // Client-side sort (sort dropdown in the toolbar) applied to the data rows.
    const sortedRows = useMemo(() => {
        const base = filteredRows;
        if (!sortField) return base;
        const dir = sortOrder;
        return [...base].sort((a, b) => {
            const va = a[sortField];
            const vb = b[sortField];
            const sa = va == null ? '' : String(va);
            const sb = vb == null ? '' : String(vb);
            return sa.localeCompare(sb, undefined, {numeric: true, sensitivity: 'base'}) * dir;
        });
    }, [filteredRows, sortField, sortOrder]);

    /** Set the sort field (toggles direction when re-selecting the same field). */
    const changeSortField = useCallback(
        (field: string | null) => {
            if (field === sortField) {
                setSortOrder(o => (o === 1 ? -1 : 1));
            } else {
                setSortField(field);
                setSortOrder(1);
            }
        },
        [sortField],
    );

    const columnOptions = useMemo(
        () => [
            {label: 'Name', value: '__treeLabel'},
            ...columns.map(c => ({label: c.header, value: c.field})),
        ],
        [columns],
    );

    // The ".." up-to-parent row is the FIRST table row (midnight-commander style),
    // so it is reachable with the arrow keys; Backspace/Enter also work.
    const parentUpRow: Record<string, unknown> | null =
        showParentRow && selected
            ? {
                  __parentUp: true,
                  __treeLabel: '..',
                  __treeKey: `${selected.key}${TREE_KEY_SEP}..`,
                  sourceName: selected.source.name,
                  levelIndex: selected.levelIndex,
              }
            : null;

    const tableValue: Record<string, unknown>[] = parentUpRow
        ? [parentUpRow, ...sortedRows]
        : sortedRows;

    /** Display label for a row's first (Name) column. */
    const rowLabel = useCallback((row: Record<string, unknown>) => {
        return String(row.__treeLabel ?? row.name ?? row.label ?? row.id ?? '');
    }, []);

    /**
     * Sortable column-header template — clicking the title toggles the sort.
     */
    const sortHeader = useCallback(
        (label: string, field: string) => (
            <span
                role="button"
                tabIndex={0}
                className="blong-commander-sort-header"
                style={{
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    userSelect: 'none',
                }}
                onClick={() => changeSortField(field)}
                onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        changeSortField(field);
                    }
                }}
            >
                {label}
                {sortField === field && (
                    <i
                        className={
                            sortOrder === 1
                                ? 'pi pi-sort-amount-up-alt'
                                : 'pi pi-sort-amount-down'
                        }
                        style={{fontSize: '0.7rem'}}
                    />
                )}
            </span>
        ),
        [sortField, sortOrder, changeSortField],
    );

    /**
     * First-column renderer: ".." (up) for the parent row, otherwise the row
     * label as a clickable link — single-click drill-down / viewer with the mouse.
     */
    const renderNameLink = useCallback(
        (row: Record<string, unknown>) => {
            if (row.__parentUp) {
                return (
                    <a
                        href="#"
                        className="blong-commander-up-link"
                        onClick={e => {
                            e.preventDefault();
                            handleUp();
                        }}
                        style={{color: 'var(--primary-color)', textDecoration: 'none'}}
                    >
                        ..
                    </a>
                );
            }
            return (
                <a
                    href="#"
                    className="blong-commander-name-link"
                    onClick={e => {
                        e.preventDefault();
                        handleRowOpen(row);
                    }}
                    style={{color: 'var(--primary-color)', textDecoration: 'none'}}
                >
                    {rowLabel(row)}
                </a>
            );
        },
        [handleUp, handleRowOpen, rowLabel],
    );

    const selectedViewer = useMemo(() => {
        if (!viewerNode) return null;
        const {source, levelIndex, node} = viewerNode;
        const level = source.levels[levelIndex];
        const resolved = resolveViewer(level, models);
        if (resolved.component) {
            const Component = resolved.component;
            return (
                <Component
                    node={cleanLeafNode(node)}
                    fetch={viewerFetch}
                    className="blong-commander-viewer"
                />
            );
        }
        return null;
    }, [viewerNode, viewerFetch, models]);

    return (
        <div
            className={`blong-commander ${className ?? ''}`}
            style={{display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0}}
        >
            <PathBar
                segments={pathSegments}
                onNavigate={handlePathNavigate}
                onJump={handleJump}
                nav={
                    <>
                        <Button
                            icon="pi pi-arrow-left"
                            className="p-button-text p-button-sm"
                            disabled={!canGoBack}
                            onClick={goBack}
                            aria-label="Back"
                            title="Back"
                        />
                        <Button
                            icon="pi pi-arrow-right"
                            className="p-button-text p-button-sm"
                            disabled={!canGoForward}
                            onClick={goForward}
                            aria-label="Forward"
                            title="Forward"
                        />
                        <Button
                            icon="pi pi-arrow-up"
                            className="p-button-text p-button-sm"
                            onClick={handleUp}
                            aria-label="Up"
                            title="Up to parent (Backspace)"
                        />
                        <Button
                            icon="pi pi-refresh"
                            className="p-button-text p-button-sm"
                            onClick={refresh}
                            aria-label="Refresh"
                            title="Refresh (F5)"
                        />
                    </>
                }
                search={
                    <div ref={searchRef} style={{display: 'flex', alignItems: 'center', gap: '0.25rem'}}>
                        <i className="pi pi-search" style={{color: 'var(--text-color-secondary)', fontSize: '0.8rem'}} />
                        <InputText
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Filter…"
                            style={{fontSize: '0.8rem', padding: '0.2rem 0.5rem', width: '11rem'}}
                        />
                    </div>
                }
            />
            <div
                className="blong-commander-toolbar"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.2rem 0.5rem',
                    borderBottom: '1px solid var(--surface-border)',
                    minHeight: '2.2rem',
                }}
            >
                <Dropdown
                    value={sortField ?? undefined}
                    options={columnOptions}
                    onChange={e => changeSortField((e.value as string | null) ?? null)}
                    placeholder="Sort…"
                    style={{fontSize: '0.8rem'}}
                />
                <Button
                    icon={sortOrder === 1 ? 'pi pi-sort-amount-up-alt' : 'pi pi-sort-amount-down'}
                    className="p-button-text p-button-sm"
                    disabled={!sortField}
                    onClick={() => setSortOrder(o => (o === 1 ? -1 : 1))}
                    aria-label="Sort direction"
                    title="Sort direction"
                />
                <SelectButton
                    value={view}
                    onChange={e => setView((e.value as CommanderView) ?? 'table')}
                    options={[
                        {label: 'Table', value: 'table'},
                        {label: 'Cards', value: 'grid'},
                    ]}
                    style={{fontSize: '0.8rem'}}
                />
                <span style={{flex: 1}} />
                <Button
                    icon="pi pi-external-link"
                    className="p-button-text p-button-sm"
                    disabled={!currentRow}
                    onClick={handleOpen}
                    aria-label="Open (F2)"
                    title="Open highlighted row (F2)"
                />
                <Button
                    icon="pi pi-question-circle"
                    className="p-button-text p-button-sm"
                    onClick={() => setHelpOpen(open => !open)}
                    aria-label="Help (?)"
                    title="Commander keys (?)"
                />
            </div>
            <Splitter
                layout="horizontal"
                gutterSize={4}
                style={{flex: 1, minHeight: 0, height: '100%'}}
                stateKey="blong-commander.splitter"
                stateStorage="local"
            >
                <SplitterPanel size={30} minSize={12} style={{overflow: 'hidden'}}>
                    <div
                        className="blong-commander-tree"
                        style={{
                            flex: 1,
                            minWidth: 0,
                            height: '100%',
                            overflowY: 'auto',
                            outline: 'none',
                        }}
                        onClick={() => setActivePane('tree')}
                    >
                        <Navigator
                            ref={navigatorRef}
                            data={treeRoots}
                            loadChildren={loadTreeChildren}
                            isLeaf={isLeaf}
                            keyField="__treeKey"
                            field="__treeLabel"
                            treeStyle={{border: 'none', padding: '0.25rem'}}
                            // No client-side permissionField pruning here: the server
                            // `commander.source.list` / `commander.branch.list` already
                            // filter by the caller's granted actions (`$meta.auth.actions`),
                            // and the client permission map keys (methodIds) don't match the
                            // source descriptor's dotted permission strings — a second
                            // client-side filter would wrongly prune visible sources.
                            onSelectPath={handleSelectPath}
                        />
                    </div>
                </SplitterPanel>
                <SplitterPanel size={70} minSize={30} style={{overflow: 'hidden'}}>
                    <div
                        className="blong-commander-content"
                        style={{
                            flex: 1,
                            minWidth: 0,
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            borderLeft: '1px solid var(--surface-border)',
                        }}
                        onClick={() => setActivePane('table')}
                        onKeyDown={e => {
                            if (e.key === 'Tab') {
                                e.preventDefault();
                                movePane(e.shiftKey ? -1 : 1);
                            }
                        }}
                    >
                    {!selected ? (
                        <div
                            className="blong-commander-home"
                            style={{
                                flex: 1,
                                minHeight: 0,
                                overflow: 'auto',
                                padding: '1.5rem',
                            }}
                            onClick={() => setActivePane('table')}
                        >
                            <h2 style={{margin: '0 0 0.25rem'}}>Backend Commander</h2>
                            <p
                                style={{
                                    margin: '0 0 1rem',
                                    color: 'var(--text-color-secondary)',
                                    fontSize: '0.85rem',
                                }}
                            >
                                Pick a backend from the tree on the left (or a tile below) to drill
                                into it. Press <strong>?</strong> for the keyboard shortcuts.
                            </p>
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(12rem, 1fr))',
                                    gap: '0.5rem',
                                }}
                            >
                                {sources.map(source => (
                                    <button
                                        key={source.name}
                                        type="button"
                                        className="blong-commander-home-source"
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            padding: '0.75rem',
                                            border: '1px solid var(--surface-border)',
                                            borderRadius: 'var(--border-radius)',
                                            background: 'transparent',
                                            color: 'var(--text-color)',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            fontSize: '0.85rem',
                                        }}
                                        onClick={() => {
                                            setViewerNode(null);
                                            navigateTo([
                                                {
                                                    key: source.name,
                                                    label: source.label,
                                                    data: {
                                                        sourceName: source.name,
                                                        levelIndex: -1,
                                                        __treeKey: source.name,
                                                        __treeLabel: source.label,
                                                    },
                                                },
                                            ]);
                                        }}
                                    >
                                        {source.icon && <i className={source.icon} />}
                                        <span>{source.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : isViewerOpen ? (
                        <div
                            style={{
                                flex: 1,
                                minHeight: 0,
                                overflow: 'auto',
                                padding: '0.25rem',
                            }}
                            onClick={() => setActivePane('viewer')}
                        >
                            {selectedViewer}
                        </div>
                    ) : view === 'grid' ? (
                        <div
                            className="blong-commander-grid"
                            style={{
                                flex: 1,
                                minHeight: 0,
                                overflow: 'auto',
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(11rem, 1fr))',
                                gap: '0.5rem',
                                padding: '0.5rem',
                                alignContent: 'start',
                            }}
                        >
                            {tableValue.map(row => (
                                <div
                                    key={String(row.__treeKey ?? '')}
                                    className="blong-commander-card"
                                    style={{
                                        border: '1px solid var(--surface-border)',
                                        borderRadius: 'var(--border-radius)',
                                        padding: '0.5rem',
                                        cursor: 'pointer',
                                    }}
                                    onDoubleClick={() => handleRowOpen(row)}
                                >
                                    <div style={{marginBottom: '0.25rem', fontWeight: 600}}>
                                        {renderNameLink(row)}
                                    </div>
                                    {columns.map(col => (
                                        <div
                                            key={col.field}
                                            style={{
                                                fontSize: '0.75rem',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            <span style={{color: 'var(--text-color-secondary)'}}>
                                                {col.header}:{' '}
                                            </span>
                                            {String(row[col.field] ?? '')}
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <DataTable
                            key={selected ? selected.key : 'home'}
                            value={tableValue}
                            loading={loading}
                            size="small"
                            selectionMode="single"
                            dataKey="__treeKey"
                            onRowClick={(e: {data: unknown}) => {
                                const row = e.data as Record<string, unknown>;
                                // Clicking the whole ".." row triggers go-up (not just the link).
                                if ((row as {__parentUp?: boolean}).__parentUp) {
                                    handleUp();
                                    return;
                                }
                                setCurrentRow(row);
                            }}
                            onRowDoubleClick={(e: {data: unknown}) =>
                                handleRowOpen(e.data as Record<string, unknown>)
                            }
                            emptyMessage="No records found."
                            style={{flex: 1, minHeight: 0}}
                        >
                            <Column
                                header={sortHeader('Name', '__treeLabel')}
                                body={(row: Record<string, unknown>) => renderNameLink(row)}
                                style={{fontSize: '0.8rem'}}
                            />
                            {columns.map(col => (
                                <Column
                                    key={col.field}
                                    field={col.field}
                                    header={sortHeader(col.header, col.field)}
                                    style={{fontSize: '0.8rem'}}
                                />
                            ))}
                        </DataTable>
                    )}
                    </div>
                </SplitterPanel>
            </Splitter>
            {helpOpen && (
                <div
                    style={{
                        position: 'absolute',
                        right: '0.5rem',
                        bottom: '0.5rem',
                        background: 'var(--surface-overlay)',
                        border: '1px solid var(--surface-border)',
                        borderRadius: 'var(--border-radius)',
                        padding: '0.75rem',
                        boxShadow: 'var(--shadow-2)',
                        zIndex: 10,
                        maxWidth: '22rem',
                        fontSize: '0.8rem',
                    }}
                >
                    <strong>Commander keys</strong>
                    <ul style={{margin: '0.25rem 0 0', paddingLeft: '1.1rem'}}>
                        <li>↑ ↓ — navigate tree / table</li>
                        <li>Enter / double-click — open node (drill or viewer)</li>
                        <li>Backspace / .. — go up to parent</li>
                        <li>F5 — refresh branch</li>
                        <li>F2 — open highlighted row</li>
                        <li>Ctrl+F — focus filter</li>
                        <li>Esc — close help</li>
                    </ul>
                </div>
            )}
        </div>
    );
}
