/**
 * The console's status bar: what is running, how far it got, what it asserted, and the controls.
 * It is the only row that stays fixed; every card below scrolls on its own.
 */
import type {ReactNode} from 'react';
import type {ITestRunModel} from '../../types/testRun.js';
import {Button} from '../Button/Button.js';
import {Text} from '../Text/Text.js';
import {formatDuration} from './testRunModel.js';

export interface ITestRunStatusBarProps {
    run: ITestRunModel;
    now?: number;
    detailsOpen: boolean;
    onToggleDetails(): void;
    /** Replay controls supplied by a fixture source or, later, by a live source. */
    controls?: ReactNode;
}

const STATUS_ICON: Record<string, string> = {
    pending: 'pi pi-circle-fill',
    running: 'pi pi-spin pi-spinner',
    completed: 'pi pi-check',
    failed: 'pi pi-times',
};

const STATUS_LABEL: Record<string, string> = {
    pending: 'pending',
    running: 'running',
    completed: 'completed',
    failed: 'failed',
};

export function TestRunStatusBar({
    run,
    now,
    detailsOpen,
    onToggleDetails,
    controls,
}: ITestRunStatusBarProps) {
    const end = run.endedAt ?? now ?? run.startedAt;
    const elapsed = run.status === 'pending' ? 0 : Math.max(0, end - run.startedAt);
    const passed = Math.max(0, run.assertions.total - run.assertions.threw);
    const progress = run.counts.total
        ? Math.round((run.counts.completed / run.counts.total) * 100)
        : 0;
    return (
        <div
            className="blong-test-run__status-bar p-card p-component"
            role="status"
        >
            <div className="blong-test-run__identity">
                <span className="blong-test-run__run-name">{run.name}</span>
                <span className="blong-test-run__method">{run.method}</span>
            </div>
            <span className={`blong-test-run__state blong-test-run__state--${run.status}`}>
                <i className={STATUS_ICON[run.status]} />
                <Text>{STATUS_LABEL[run.status]}</Text>
            </span>
            <span className="blong-test-run__elapsed">{formatDuration(elapsed)}</span>
            <div
                className="blong-test-run__progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={run.counts.total}
                aria-valuenow={run.counts.completed}
                aria-label="Completed steps"
            >
                <span
                    className="blong-test-run__progress-fill"
                    style={{width: `${progress}%`}}
                />
            </div>
            <span
                className="blong-test-run__step-count"
                aria-live="polite"
            >
                {run.counts.completed}/{run.counts.total}
                {run.counts.failed > 0 && (
                    <span className="blong-test-run__failed-count">
                        {' '}
                        {run.counts.failed} failed
                    </span>
                )}
            </span>
            <span
                className="blong-test-run__assertions-summary"
                aria-live="polite"
                title={`${passed} passed, ${run.assertions.threw} threw`}
            >
                <span className="blong-test-run__passed">✓ {passed}</span>
                <span
                    className={
                        run.assertions.threw
                            ? 'blong-test-run__threw'
                            : 'blong-test-run__threw is-zero'
                    }
                >
                    ✗ {run.assertions.threw}
                </span>
            </span>
            <span
                className="blong-test-run__concurrency"
                title="Maximum parallel steps"
            >
                ×{run.concurrency}
            </span>
            <div className="blong-test-run__controls">
                {controls}
                <Button
                    type="button"
                    text
                    size="small"
                    icon={detailsOpen ? 'pi pi-chevron-right' : 'pi pi-list'}
                    label={detailsOpen ? 'Hide details' : 'Details'}
                    aria-pressed={detailsOpen}
                    onClick={onToggleDetails}
                />
            </div>
        </div>
    );
}
