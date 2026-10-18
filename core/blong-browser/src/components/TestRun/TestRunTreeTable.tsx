/**
 * The run tree-table: the step tree and the timeline in one row per group or step.
 *
 * The table is a `treegrid`: the keyboard moves the selection, collapses groups and opens the
 * details panel, while a pointer click selects a row everywhere in the console.
 */
import {useMemo, type KeyboardEvent} from 'react';
import {InputText} from '../../primereact/index.js';
import type {
    ITestRunModel,
    ITestRunRowLayout,
    ITestRunTreeLayout,
    TestRunFilter,
    TestRunOrder,
} from '../../types/testRun.js';
import {Text} from '../Text/Text.js';
import {TestRunBar, TestRunRuler} from './TestRunBars.js';
import {assertionFailed, assertionLabel, formatDuration} from './testRunModel.js';

export const SLOW_STEP_MS = 250;

export interface ITestRunTreeTableProps {
    run: ITestRunModel;
    layout: ITestRunTreeLayout;
    selectedKey?: string;
    hoveredKey?: string;
    filter: TestRunFilter;
    search: string;
    order: TestRunOrder;
    collapsed: ReadonlySet<string>;
    /** Present only while the run is live. */
    now?: number;
    onSelect(stepName: string | undefined): void;
    onHover(stepName: string | undefined): void;
    onToggleGroup(key: string): void;
    onFilterChange(filter: TestRunFilter): void;
    onSearchChange(search: string): void;
    onOrderChange(order: TestRunOrder): void;
    onOpenDetails?(stepName: string): void;
}

const FILTERS: Array<{value: TestRunFilter; label: string}> = [
    {value: 'all', label: 'All'},
    {value: 'running', label: 'Running'},
    {value: 'failed', label: 'Failed'},
    {value: 'slow', label: 'Slow'},
];

const STATUS_ICON: Record<string, string> = {
    pending: 'pi pi-circle-fill',
    running: 'pi pi-spin pi-spinner',
    completed: 'pi pi-check',
    failed: 'pi pi-times',
};

export function TestRunTreeTable({
    run,
    layout,
    selectedKey,
    hoveredKey,
    filter,
    search,
    order,
    collapsed,
    now,
    onSelect,
    onHover,
    onToggleGroup,
    onFilterChange,
    onSearchChange,
    onOrderChange,
    onOpenDetails,
}: ITestRunTreeTableProps) {
    const visible = layout.visibleSteps;
    const move = (delta: number): void => {
        if (!visible.length) return;
        const index = selectedKey ? visible.indexOf(selectedKey) : -1;
        const next = Math.min(visible.length - 1, Math.max(0, index + delta));
        onSelect(visible[next]);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            move(selectedKey ? 1 : 0);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            move(-1);
        } else if (event.key === 'Home') {
            event.preventDefault();
            onSelect(visible[0]);
        } else if (event.key === 'End') {
            event.preventDefault();
            onSelect(visible[visible.length - 1]);
        } else if (event.key === 'Enter' && selectedKey) {
            event.preventDefault();
            onOpenDetails?.(selectedKey);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            const row = layout.rows.find(item => item.stepName === selectedKey);
            if (!row) return;
            const parent = layout.rows
                .filter(
                    item =>
                        item.kind === 'group' && item.key === `group:${row.groupPath.join('/')}`,
                )
                .at(-1);
            if (!parent) return;
            const isCollapsed = collapsed.has(parent.key);
            if (event.key === 'ArrowLeft' && !isCollapsed) {
                event.preventDefault();
                onToggleGroup(parent.key);
            } else if (event.key === 'ArrowRight' && isCollapsed) {
                event.preventDefault();
                onToggleGroup(parent.key);
            }
        }
    };

    const groupCounts = useMemo(() => {
        const map = new Map<string, {total: number; completed: number; failed: number}>();
        for (const group of run.groups) {
            map.set(`group:${group.path.join('/')}`, {
                total: group.totalSteps,
                completed: group.completedSteps,
                failed: group.failedSteps,
            });
        }
        return map;
    }, [run.groups]);

    const renderRow = (row: ITestRunRowLayout) => {
        if (row.kind === 'group') {
            const counts = groupCounts.get(row.key);
            return (
                <div
                    key={row.key}
                    id={`test-run-${row.key}`}
                    role="row"
                    aria-level={row.depth + 1}
                    aria-expanded={!row.collapsed}
                    className="blong-test-run__grid blong-test-run__row blong-test-run__row--group"
                    onMouseEnter={() => onHover(undefined)}
                >
                    <div
                        role="gridcell"
                        className="blong-test-run__name"
                        style={{paddingLeft: `${6 + row.depth * 14}px`}}
                    >
                        <button
                            type="button"
                            className="blong-test-run__chevron"
                            aria-label={row.collapsed ? 'Expand group' : 'Collapse group'}
                            onClick={() => onToggleGroup(row.key)}
                        >
                            <i
                                className={`pi ${row.collapsed ? 'pi-chevron-right' : 'pi-chevron-down'}`}
                            />
                        </button>
                        <i className={`blong-test-run__status ${STATUS_ICON[row.status]}`} />
                        <span className="blong-test-run__label">{row.label}</span>
                        <span className="blong-test-run__count">
                            {counts ? `${counts.completed}/${counts.total}` : ''}
                        </span>
                        {row.hiddenCount > 0 && (
                            <span className="blong-test-run__muted">
                                {row.collapsed
                                    ? `${row.hiddenCount} hidden`
                                    : `${row.hiddenCount} filtered`}
                            </span>
                        )}
                    </div>
                    <div
                        role="gridcell"
                        className="blong-test-run__assertions"
                    >
                        {row.assertions && row.assertions.total > 0
                            ? assertionLabel(row.assertions)
                            : ''}
                    </div>
                    <div
                        role="gridcell"
                        className="blong-test-run__duration"
                    >
                        {formatDuration(row.duration)}
                    </div>
                    <div
                        role="gridcell"
                        className="blong-test-run__bar-cell"
                    >
                        <TestRunBar
                            row={row}
                            layout={layout}
                            now={now}
                        />
                    </div>
                </div>
            );
        }
        const selected = row.stepName === selectedKey;
        const hovered = row.stepName === hoveredKey;
        return (
            <div
                key={row.key}
                id={`test-run-step-${row.stepName}`}
                role="row"
                aria-level={row.depth + 1}
                aria-selected={selected}
                data-testid={`test-run-step-${row.stepName}`}
                className={[
                    'blong-test-run__grid',
                    'blong-test-run__row',
                    'blong-test-run__row--step',
                    `blong-test-run__row--${row.status}`,
                    selected ? 'is-selected' : '',
                    hovered ? 'is-hovered' : '',
                ]
                    .filter(Boolean)
                    .join(' ')}
                onClick={() => onSelect(selected ? undefined : row.stepName)}
                onDoubleClick={() => row.stepName && onOpenDetails?.(row.stepName)}
                onMouseEnter={() => onHover(row.stepName)}
                onMouseLeave={() => onHover(undefined)}
            >
                <div
                    role="gridcell"
                    className="blong-test-run__name"
                    style={{paddingLeft: `${10 + row.depth * 14}px`}}
                    title={
                        row.stepName
                            ? `${row.stepName}${run.steps[row.stepName]?.dependencies.length ? ` · depends on ${run.steps[row.stepName].dependencies.join(', ')}` : ''}`
                            : row.label
                    }
                >
                    <i className={`blong-test-run__status ${STATUS_ICON[row.status]}`} />
                    <span className="blong-test-run__label">{row.label}</span>
                </div>
                <div
                    role="gridcell"
                    className={[
                        'blong-test-run__assertions',
                        assertionFailed(row.assertions) ? 'is-failed' : '',
                    ]
                        .filter(Boolean)
                        .join(' ')}
                >
                    {row.assertions && row.assertions.total > 0
                        ? assertionLabel(row.assertions)
                        : ''}
                </div>
                <div
                    role="gridcell"
                    className="blong-test-run__duration"
                >
                    {formatDuration(row.duration)}
                </div>
                <div
                    role="gridcell"
                    className="blong-test-run__bar-cell"
                >
                    <TestRunBar
                        row={row}
                        layout={layout}
                        now={now}
                        critical={!!row.stepName && run.criticalPath.includes(row.stepName)}
                    />
                </div>
            </div>
        );
    };

    return (
        <div className="blong-test-run__tree">
            <div className="blong-test-run__tree-toolbar">
                <div
                    className="blong-test-run__filters"
                    role="group"
                    aria-label="Filter steps"
                >
                    {FILTERS.map(item => (
                        <button
                            key={item.value}
                            type="button"
                            className={`blong-test-run__chip${filter === item.value ? ' is-active' : ''}`}
                            aria-pressed={filter === item.value}
                            onClick={() => onFilterChange(item.value)}
                        >
                            <Text>{item.label}</Text>
                        </button>
                    ))}
                </div>
                <span className="blong-test-run__search">
                    <i className="pi pi-search" />
                    <InputText
                        value={search}
                        aria-label="Search steps"
                        placeholder="Search"
                        onChange={event => onSearchChange(event.target.value)}
                    />
                </span>
                <button
                    type="button"
                    className="blong-test-run__chip"
                    title={order === 'tree' ? 'Order by start time' : 'Restore the tree order'}
                    onClick={() => onOrderChange(order === 'tree' ? 'start' : 'tree')}
                >
                    <i className={`pi ${order === 'tree' ? 'pi-sitemap' : 'pi-list'}`} />
                    <Text>{order === 'tree' ? 'Tree' : 'By start'}</Text>
                </button>
            </div>
            <TestRunRuler layout={layout} />
            <div
                className="blong-test-run__rows"
                role="treegrid"
                aria-label="Test steps and their timing"
                aria-activedescendant={selectedKey ? `test-run-step-${selectedKey}` : undefined}
                tabIndex={0}
                onKeyDown={onKeyDown}
                onMouseLeave={() => onHover(undefined)}
            >
                {layout.rows.map(renderRow)}
                {!layout.rows.length && (
                    <div className="blong-test-run__empty">
                        <Text>No steps match the filter</Text>
                    </div>
                )}
            </div>
        </div>
    );
}
