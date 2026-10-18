/**
 * Dependency graph — the connected part of the run at its natural node size, plus a flex group of
 * the single steps and pairs that would otherwise stretch the graph's widest level. The loose group
 * reuses the graph node's rectangle, status border, dot and label.
 *
 * The graph is small (tens of nodes), so a plain SVG with a viewBox is enough: wheel zooms, drag
 * pans, and a fit button restores the whole graph. Selection is shared with the tree-table.
 */
import type {PointerEvent} from 'react';
import {Fragment, useEffect, useMemo, useRef, useState} from 'react';
import type {ITestRunModel} from '../../types/testRun.js';
import {Text} from '../Text/Text.js';
import {buildGraphLayout, edgeLabel, splitDependencies} from './testRunLayout.js';
import {deriveTestRun} from './testRunModel.js';

export interface ITestRunGraphProps {
    run: ITestRunModel;
    selectedKey?: string;
    hoveredKey?: string;
    onSelect(stepName: string | undefined): void;
    onHover(stepName: string | undefined): void;
}

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

export function TestRunGraph({
    run,
    selectedKey,
    hoveredKey,
    onSelect,
    onHover,
}: ITestRunGraphProps) {
    const split = useMemo(() => splitDependencies(run), [run]);
    const graphRun = useMemo(() => {
        if (!split.graph.steps.length) return undefined;
        const steps = Object.fromEntries(split.graph.steps.map(name => [name, run.steps[name]]));
        return deriveTestRun({
            ...run,
            order: split.graph.steps,
            steps,
            edges: split.graph.edges,
        });
    }, [run, split]);
    const layout = useMemo(() => (graphRun ? buildGraphLayout(graphRun) : undefined), [graphRun]);
    const ref = useRef<SVGSVGElement>(null);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({x: 0, y: 0});
    const dragRef = useRef<{
        x: number;
        y: number;
        panX: number;
        panY: number;
        vbWidth: number;
        vbHeight: number;
        clientWidth: number;
        clientHeight: number;
    } | null>(null);

    const viewWidth = (layout?.width ?? 1) / zoom;
    const viewHeight = (layout?.height ?? 1) / zoom;
    const maxPanX = Math.max(0, ((layout?.width ?? 1) - viewWidth) / 2);
    const maxPanY = Math.max(0, ((layout?.height ?? 1) - viewHeight) / 2);
    const viewBox = [
        ((layout?.width ?? 1) - viewWidth) / 2 + clamp(pan.x, -maxPanX, maxPanX),
        ((layout?.height ?? 1) - viewHeight) / 2 + clamp(pan.y, -maxPanY, maxPanY),
        viewWidth,
        viewHeight,
    ].join(' ');

    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const onWheel = (event: globalThis.WheelEvent): void => {
            event.preventDefault();
            setZoom(value => clamp(value * Math.exp(-event.deltaY * 0.0015), 0.6, 3));
        };
        element.addEventListener('wheel', onWheel as unknown as EventListener, {passive: false});
        return () => element.removeEventListener('wheel', onWheel as unknown as EventListener);
    }, []);

    const onPointerDown = (event: PointerEvent<SVGSVGElement>): void => {
        if (event.button !== 0) return;
        const element = event.currentTarget;
        element.setPointerCapture?.(event.pointerId);
        dragRef.current = {
            x: event.clientX,
            y: event.clientY,
            panX: pan.x,
            panY: pan.y,
            vbWidth: viewWidth,
            vbHeight: viewHeight,
            clientWidth: element.clientWidth || 1,
            clientHeight: element.clientHeight || 1,
        };
    };
    const onPointerMove = (event: PointerEvent<SVGSVGElement>): void => {
        const start = dragRef.current;
        if (!start) return;
        setPan({
            x: start.panX - ((event.clientX - start.x) / start.clientWidth) * start.vbWidth,
            y: start.panY - ((event.clientY - start.y) / start.clientHeight) * start.vbHeight,
        });
    };
    const endDrag = (): void => {
        dragRef.current = null;
    };

    const focus = hoveredKey ?? selectedKey;
    const graphFocus = graphRun && focus && graphRun.steps[focus] ? focus : undefined;
    const related = useMemo(() => {
        if (!graphFocus) return undefined;
        const set = new Set<string>([graphFocus]);
        for (const edge of graphRun?.edges ?? []) {
            if (edge.from === graphFocus) set.add(edge.to);
            if (edge.to === graphFocus) set.add(edge.from);
        }
        return set;
    }, [graphFocus, graphRun]);

    return (
        <div className="blong-test-run__graph">
            <div className="blong-test-run__graph-main">
                {layout ? (
                    <>
                        <div className="blong-test-run__graph-controls">
                            <button
                                type="button"
                                className="blong-test-run__graph-button"
                                aria-label="Zoom in"
                                onClick={() => setZoom(value => clamp(value * 1.2, 0.6, 3))}
                            >
                                <i className="pi pi-plus" />
                            </button>
                            <button
                                type="button"
                                className="blong-test-run__graph-button"
                                aria-label="Zoom out"
                                onClick={() => setZoom(value => clamp(value / 1.2, 0.6, 3))}
                            >
                                <i className="pi pi-minus" />
                            </button>
                            <button
                                type="button"
                                className="blong-test-run__graph-button"
                                aria-label="Fit graph"
                                onClick={() => {
                                    setZoom(1);
                                    setPan({x: 0, y: 0});
                                }}
                            >
                                <i className="pi pi-expand" />
                            </button>
                        </div>
                        <svg
                            ref={ref}
                            className="blong-test-run__graph-svg"
                            viewBox={viewBox}
                            style={{width: layout.width, height: layout.height}}
                            preserveAspectRatio="xMidYMid meet"
                            role="group"
                            aria-label="Step dependency graph"
                            onPointerDown={onPointerDown}
                            onPointerMove={onPointerMove}
                            onPointerUp={endDrag}
                            onPointerCancel={endDrag}
                        >
                            <g className="blong-test-run__edges">
                                {layout.edges.map(({edge, path}) => {
                                    const active =
                                        graphFocus !== undefined &&
                                        (edge.from === graphFocus || edge.to === graphFocus);
                                    return (
                                        <path
                                            key={edge.id}
                                            d={path}
                                            className={[
                                                'blong-test-run__edge',
                                                `blong-test-run__edge--${edge.status}`,
                                                active ? 'is-active' : '',
                                            ]
                                                .filter(Boolean)
                                                .join(' ')}
                                            onClick={() => onSelect(edge.from)}
                                        >
                                            <title>{edgeLabel(edge)}</title>
                                        </path>
                                    );
                                })}
                            </g>
                            <g className="blong-test-run__nodes">
                                {layout.nodes.map(node => {
                                    const step = run.steps[node.stepName];
                                    const selected = selectedKey === node.stepName;
                                    const hovered = hoveredKey === node.stepName;
                                    const dim = !!related && !related.has(node.stepName);
                                    const maxChars = Math.max(
                                        6,
                                        Math.floor((node.width - 26) / 6.2),
                                    );
                                    return (
                                        <g
                                            key={node.stepName}
                                            className={[
                                                'blong-test-run__node',
                                                `blong-test-run__node--${step.status}`,
                                                selected ? 'is-selected' : '',
                                                hovered ? 'is-hovered' : '',
                                                dim ? 'is-dim' : '',
                                                run.criticalPath.includes(node.stepName)
                                                    ? 'is-critical'
                                                    : '',
                                            ]
                                                .filter(Boolean)
                                                .join(' ')}
                                            transform={`translate(${node.x} ${node.y})`}
                                            data-testid={`test-run-node-${node.stepName}`}
                                            role="button"
                                            tabIndex={0}
                                            aria-label={`${step.displayName}: ${step.status}`}
                                            onClick={event => {
                                                event.stopPropagation();
                                                onSelect(selected ? undefined : node.stepName);
                                            }}
                                            onMouseEnter={() => onHover(node.stepName)}
                                            onMouseLeave={() => onHover(undefined)}
                                            onKeyDown={event => {
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault();
                                                    onSelect(node.stepName);
                                                }
                                            }}
                                        >
                                            <rect
                                                width={node.width}
                                                height={node.height}
                                                rx={5}
                                            />
                                            <circle
                                                cx={10}
                                                cy={node.height / 2}
                                                r={3.5}
                                                className="blong-test-run__node-dot"
                                            />
                                            <text
                                                x={20}
                                                y={node.height / 2 + 3.5}
                                                className="blong-test-run__node-label"
                                            >
                                                {node.label.length > maxChars
                                                    ? `${node.label.slice(0, maxChars - 1)}…`
                                                    : node.label}
                                            </text>
                                            <title>
                                                {`${node.stepName} · ${step.status}${step.dependencies.length ? ` · after ${step.dependencies.join(', ')}` : ''}`}
                                            </title>
                                        </g>
                                    );
                                })}
                            </g>
                        </svg>
                    </>
                ) : (
                    <div className="blong-test-run__graph-empty">
                        <Text>{split.loose.length ? 'No linked steps' : 'No steps to graph'}</Text>
                    </div>
                )}
                {split.loose.length > 0 && (
                    <div
                        className="blong-test-run__loose"
                        role="list"
                        aria-label="Steps outside the dependency graph"
                    >
                        {split.loose.map(component => (
                            <span
                                key={component.steps.join('>')}
                                className="blong-test-run__loose-group"
                                role="listitem"
                            >
                                {component.steps.map((name, index) => {
                                    const step = run.steps[name];
                                    const selected = selectedKey === name;
                                    return (
                                        <Fragment key={name}>
                                            {index > 0 && (
                                                <i className="pi pi-arrow-right blong-test-run__loose-arrow" />
                                            )}
                                            <button
                                                type="button"
                                                className={[
                                                    'blong-test-run__graph-node',
                                                    `blong-test-run__graph-node--${step.status}`,
                                                    selected ? 'is-selected' : '',
                                                ]
                                                    .filter(Boolean)
                                                    .join(' ')}
                                                title={`${name} · ${step.status}`}
                                                onClick={() =>
                                                    onSelect(selected ? undefined : name)
                                                }
                                                onMouseEnter={() => onHover(name)}
                                                onMouseLeave={() => onHover(undefined)}
                                            >
                                                <span className="blong-test-run__graph-node-dot" />
                                                <span className="blong-test-run__graph-node-label">
                                                    {step.displayName}
                                                </span>
                                            </button>
                                        </Fragment>
                                    );
                                })}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
