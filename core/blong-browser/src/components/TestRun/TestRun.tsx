/**
 * TestRun — the interactive console for a chain test run.
 *
 * The component is a pure view over `ITestRunModel`: one tree-table for the steps and their timing,
 * one dependency-graph card, and an optional details panel below them. Selection, collapse, filters
 * and the details toggle are internal state unless the caller controls them.
 */
import {useEffect, useMemo, useState, type KeyboardEvent} from 'react';
import type {
    ITestRunViewProps,
    ITestStepModel,
    TestRunFilter,
    TestRunOrder,
} from '../../types/testRun.js';
import {Card} from '../Card/Card.js';
import {Deck} from '../Deck/Deck.js';
import {Text} from '../Text/Text.js';
import {Splitter, SplitterPanel} from '../../primereact/index.js';
import './TestRun.css';
import {TestRunDetails} from './TestRunDetails.js';
import {TestRunGraph} from './TestRunGraph.js';
import {buildTreeLayout} from './testRunLayout.js';
import {TestRunStatusBar} from './TestRunStatusBar.js';
import {SLOW_STEP_MS, TestRunTreeTable} from './TestRunTreeTable.js';

export function TestRun({
    run,
    now: fixedNow,
    selectedKey: controlledSelected,
    hoveredKey: controlledHovered,
    detailsOpen: controlledDetails,
    defaultSelectedKey,
    defaultDetailsOpen = false,
    defaultCollapsed = [],
    defaultOrder = 'tree',
    defaultFilter = 'all',
    onSelect,
    onHover,
    onToggleDetails,
    controls,
    sourceLink,
    className,
}: ITestRunViewProps) {
    const [internalSelected, setInternalSelected] = useState<string | undefined>(
        defaultSelectedKey,
    );
    const [internalDetails, setInternalDetails] = useState(defaultDetailsOpen);
    const [hovered, setHovered] = useState<string | undefined>(controlledHovered);
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
        () => new Set(defaultCollapsed),
    );
    const [order, setOrder] = useState<TestRunOrder>(defaultOrder);
    const [filter, setFilter] = useState<TestRunFilter>(defaultFilter);
    const [search, setSearch] = useState('');
    const [follow, setFollow] = useState(true);
    const [clock, setClock] = useState(() => Date.now());

    const selectedKey = controlledSelected !== undefined ? controlledSelected : internalSelected;
    const detailsOpen = controlledDetails !== undefined ? controlledDetails : internalDetails;
    const hoveredKey = controlledHovered !== undefined ? controlledHovered : hovered;
    const isLive = run.status === 'running';

    useEffect(() => {
        if (!isLive || fixedNow !== undefined) return;
        const id = window.setInterval(() => setClock(Date.now()), 250);
        return () => window.clearInterval(id);
    }, [isLive, fixedNow]);

    const now = fixedNow ?? (isLive ? clock : undefined);

    const matches = useMemo(() => {
        const query = search.trim().toLowerCase();
        return (step: ITestStepModel): boolean => {
            if (filter === 'running' && step.status !== 'running') return false;
            if (filter === 'failed' && step.status !== 'failed') return false;
            if (filter === 'slow' && (step.duration ?? 0) < SLOW_STEP_MS) return false;
            if (query && !`${step.stepName} ${step.displayName}`.toLowerCase().includes(query)) {
                return false;
            }
            return true;
        };
    }, [filter, search]);

    const layout = useMemo(
        () => buildTreeLayout(run, {collapsed, order, now, filter: matches}),
        [run, collapsed, order, now, matches],
    );

    const select = (stepName: string | undefined): void => {
        if (controlledSelected === undefined) setInternalSelected(stepName);
        onSelect?.(stepName);
    };
    const setDetails = (open: boolean): void => {
        if (controlledDetails === undefined) setInternalDetails(open);
        onToggleDetails?.(open);
    };
    const toggleDetails = (): void => setDetails(!detailsOpen);
    const setHover = (stepName: string | undefined): void => {
        if (controlledHovered === undefined) setHovered(stepName);
        onHover?.(stepName);
    };
    const toggleGroup = (key: string): void => {
        setCollapsed(current => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const runningStep = run.order.find(name => run.steps[name]?.status === 'running');
    useEffect(() => {
        if (!follow || !runningStep || order !== 'tree') return;
        const element = document.getElementById(`test-run-step-${runningStep}`);
        if (!element?.scrollIntoView) return;
        element.scrollIntoView({block: 'nearest'});
        return undefined;
    }, [follow, runningStep, order, layout.rows.length]);

    const onKeyDown = (event: KeyboardEvent): void => {
        const target = event.target as HTMLElement;
        if (
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable
        ) {
            return;
        }
        if (event.key === 'l') {
            event.preventDefault();
            toggleDetails();
        } else if (event.key === 'f') {
            event.preventDefault();
            setFollow(value => !value);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            select(undefined);
        }
    };

    const renderBody = () => (
        <Splitter
            layout="horizontal"
            gutterSize={6}
            className="blong-test-run__body"
        >
            <SplitterPanel
                size={66}
                minSize={30}
                className="blong-test-run__main"
            >
                <Deck id="test-run-main">
                    <Card
                        title={<Text>Steps</Text>}
                        className="blong-test-run__card"
                    >
                        {run.order.length === 0 ? (
                            <div className="blong-test-run__empty">
                                <Text>No steps in this run</Text>
                            </div>
                        ) : (
                            <TestRunTreeTable
                                run={run}
                                layout={layout}
                                selectedKey={selectedKey}
                                hoveredKey={hoveredKey}
                                filter={filter}
                                search={search}
                                order={order}
                                collapsed={collapsed}
                                now={isLive ? now : undefined}
                                onSelect={select}
                                onHover={setHover}
                                onToggleGroup={toggleGroup}
                                onFilterChange={setFilter}
                                onSearchChange={setSearch}
                                onOrderChange={setOrder}
                                onOpenDetails={stepName => {
                                    select(stepName);
                                    setDetails(true);
                                }}
                            />
                        )}
                    </Card>
                </Deck>
            </SplitterPanel>
            <SplitterPanel
                size={34}
                minSize={22}
                className="blong-test-run__side"
            >
                <Deck id="test-run-side">
                    <Card
                        title={<Text>Dependencies</Text>}
                        className="blong-test-run__card"
                    >
                        <TestRunGraph
                            run={run}
                            selectedKey={selectedKey}
                            hoveredKey={hoveredKey}
                            onSelect={select}
                            onHover={setHover}
                        />
                    </Card>
                </Deck>
            </SplitterPanel>
        </Splitter>
    );

    return (
        <div
            className={['blong-test-run', className ?? ''].filter(Boolean).join(' ')}
            onKeyDown={onKeyDown}
        >
            <TestRunStatusBar
                run={run}
                now={now}
                detailsOpen={detailsOpen}
                onToggleDetails={toggleDetails}
                controls={controls}
            />
            {run.error && (
                <div className="blong-test-run__error-banner">
                    <i className="pi pi-exclamation-triangle" />
                    <span>{run.error.message}</span>
                </div>
            )}
            {detailsOpen ? (
                <Splitter
                    layout="vertical"
                    gutterSize={6}
                    className="blong-test-run__split"
                >
                    <SplitterPanel
                        size={76}
                        minSize={30}
                        className="blong-test-run__body-panel"
                    >
                        {renderBody()}
                    </SplitterPanel>
                    <SplitterPanel
                        size={24}
                        minSize={15}
                        className="blong-test-run__details-panel"
                    >
                        <TestRunDetails
                            run={run}
                            stepName={selectedKey}
                            open
                            sourceLink={sourceLink}
                            onClose={() => setDetails(false)}
                        />
                    </SplitterPanel>
                </Splitter>
            ) : (
                renderBody()
            )}
        </div>
    );
}
