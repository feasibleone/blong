/**
 * The timeline half of the run tree-table: the sticky ruler, the bar cells and the now marker.
 * The bars are plain CSS boxes positioned by percentage, so every row shares the ruler's scale.
 */
import type {ITestRunRowLayout, ITestRunTreeLayout} from '../../types/testRun.js';
import {barPct, nowPct, timePct} from './testRunLayout.js';
import {assertionLabel, formatDuration} from './testRunModel.js';

const EMPTY_CELL = <span className="blong-test-run__cell" />;

export function TestRunRuler({layout}: {layout: ITestRunTreeLayout}) {
    return (
        <div
            className="blong-test-run__grid blong-test-run__ruler"
            aria-hidden="true"
        >
            {EMPTY_CELL}
            {EMPTY_CELL}
            {EMPTY_CELL}
            <div className="blong-test-run__track">
                {layout.ticks.map(tick => (
                    <span
                        key={tick.at}
                        className="blong-test-run__tick"
                        style={{left: `${timePct(tick.at, layout.t0, layout.t1)}%`}}
                    >
                        <span className="blong-test-run__tick-label">{tick.label}</span>
                    </span>
                ))}
            </div>
        </div>
    );
}

export interface ITestRunBarProps {
    row: ITestRunRowLayout;
    layout: ITestRunTreeLayout;
    /** Present only while the run is live; a finished run has no now marker. */
    now?: number;
    critical?: boolean;
}

export function TestRunBar({row, layout, now, critical}: ITestRunBarProps) {
    const queueMs = row.span && row.kind === 'step' ? row.span.queueEnd - row.span.start : 0;
    const tooltip = [
        row.label,
        formatDuration(row.duration),
        queueMs > 0 ? `queued ${formatDuration(queueMs)}` : undefined,
        row.assertions ? `assertions ${assertionLabel(row.assertions)}` : undefined,
    ]
        .filter(Boolean)
        .join(' · ');

    if (!row.span) {
        return (
            <div
                className="blong-test-run__track"
                title={tooltip}
            >
                <span className="blong-test-run__bar-empty" />
            </div>
        );
    }

    const {left, width, queueWidth} = barPct(row.span, layout.t0, layout.t1);
    const classes = [
        'blong-test-run__bar',
        `blong-test-run__bar--${row.status}`,
        row.kind === 'group' ? 'blong-test-run__bar--group' : '',
        critical ? 'blong-test-run__bar--critical' : '',
    ]
        .filter(Boolean)
        .join(' ');
    const nowMarker =
        now === undefined ? null : (
            <span
                className="blong-test-run__now"
                style={{left: `${nowPct(now, layout.t0, layout.t1)}%`}}
            />
        );
    const sr = <span className="blong-test-run__sr">duration {formatDuration(row.duration)}</span>;

    if (row.kind === 'group') {
        return (
            <div
                className="blong-test-run__track"
                title={tooltip}
            >
                <div
                    className={classes}
                    style={{left: `${left}%`, width: `${Math.max(width, 0.6)}%`}}
                />
                {nowMarker}
                {sr}
            </div>
        );
    }

    // The queue is a thin line so a long wait does not read as work; the solid bar is the
    // execution measured from the moment the step actually started.
    const executionLeft = left + queueWidth;
    const executionWidth = Math.max(0, width - queueWidth);
    return (
        <div
            className="blong-test-run__track"
            title={tooltip}
            data-step-name={row.stepName}
        >
            {queueMs > 0 && (
                <span
                    className="blong-test-run__queue-line"
                    style={{left: `${left}%`, width: `${queueWidth}%`}}
                />
            )}
            <div
                className={classes}
                style={{
                    left: `${executionLeft}%`,
                    width: `${Math.max(executionWidth, 1.2)}%`,
                }}
            >
                {row.status === 'failed' && <span className="blong-test-run__bar-fail" />}
            </div>
            {nowMarker}
            {sr}
        </div>
    );
}
