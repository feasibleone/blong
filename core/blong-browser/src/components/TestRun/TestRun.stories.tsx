import type {IAssert} from '@feasibleone/blong';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {useEffect, useRef, useState, type ReactNode} from 'react';
import {userEvent, within} from 'storybook/test';
import type {ITestRunModel, ITestRunRecording} from '../../types/testRun.js';
import {Button} from '../Button/Button.js';
import {BrowserTestRunSource, pendingBrowserRun} from './browserTestRunSource.js';
import {
    denseRun,
    sessionFlowFailure,
    sessionFlowPending,
    sessionFlowRecording,
    sessionFlowRun,
} from './fixtures/sessionFlow.js';
import {TestRun} from './TestRun.js';
import {emptyTestRun, recordingDuration, reduceTestRunEvent, replayTo} from './testRunModel.js';
import {TestRunPage} from './TestRunPage.js';

/**
 * TestRun stories — the live replay, the frozen milestones the console must survive, and the
 * density and narrow cases. The fixture is hand-authored from `testSessionFlow`.
 */
const meta: Meta<typeof TestRun> = {
    title: 'Components/TestRun',
    component: TestRun,
    parameters: {layout: 'fullscreen'},
    tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof meta>;

function Frame({children, width}: {children: ReactNode; width?: number}) {
    return (
        <div
            style={{
                height: '100vh',
                width: width ?? '100%',
                padding: 8,
                boxSizing: 'border-box',
            }}
        >
            {children}
        </div>
    );
}

/**
 * Replay a recording at a chosen speed.
 *
 * The event timer decides when the next event lands; a separate 100 ms interval advances the now
 * marker between events, so a running bar grows smoothly instead of jumping once per step.
 */
function useReplay(recording: ITestRunRecording) {
    const duration = recordingDuration(recording);
    const initial: ITestRunModel =
        recording.events[0]?.event.kind === 'run:start'
            ? recording.events[0].event.run
            : recording.final;
    const [run, setRun] = useState<ITestRunModel>(initial);
    const [index, setIndex] = useState(1);
    const [paused, setPaused] = useState(false);
    const [speed, setSpeed] = useState(1);
    const [clock, setClock] = useState(0);
    const clockRef = useRef(0);
    const lastAtRef = useRef(0);
    const firedAtRef = useRef(0);

    clockRef.current = clock;

    useEffect(() => {
        if (paused || index >= recording.events.length) return;
        const next = recording.events[index];
        const previousAt = recording.events[index - 1]?.at ?? 0;
        const delay = Math.max(0, (next.at - previousAt) / speed);
        const id = window.setTimeout(() => {
            setRun(model => reduceTestRunEvent(model, next.event));
            lastAtRef.current = next.at;
            firedAtRef.current = performance.now();
            setClock(next.at);
            setIndex(value => value + 1);
        }, delay);
        return () => window.clearTimeout(id);
    }, [index, paused, speed, recording]);

    useEffect(() => {
        if (paused) return;
        lastAtRef.current = clockRef.current;
        firedAtRef.current = performance.now();
        const id = window.setInterval(() => {
            setClock(
                Math.min(
                    duration,
                    lastAtRef.current + (performance.now() - firedAtRef.current) * speed,
                ),
            );
        }, 100);
        return () => window.clearInterval(id);
    }, [paused, speed, duration]);

    const restart = (): void => {
        setRun(initial);
        setIndex(1);
        setPaused(false);
        setClock(0);
        lastAtRef.current = 0;
        firedAtRef.current = performance.now();
    };

    const controls = (
        <>
            <Button
                type="button"
                text
                size="small"
                icon={paused ? 'pi pi-play' : 'pi pi-pause'}
                aria-label={paused ? 'Play' : 'Pause'}
                onClick={() => setPaused(value => !value)}
            />
            <Button
                type="button"
                text
                size="small"
                label={`${speed}x`}
                aria-label="Change replay speed"
                onClick={() => setSpeed(value => (value === 1 ? 4 : value === 4 ? 16 : 1))}
            />
            <Button
                type="button"
                text
                size="small"
                icon="pi pi-replay"
                aria-label="Restart replay"
                onClick={restart}
            />
        </>
    );

    return {run, now: run.startedAt + clock, controls};
}

function ReplayDemo() {
    const {run, now, controls} = useReplay(sessionFlowRecording());
    return (
        <Frame>
            <TestRun
                run={run}
                now={now}
                controls={controls}
            />
        </Frame>
    );
}

/** The fixture replaying live at 1x; use the controls to pause, speed up or restart. */
export const Replay: Story = {
    render: () => <ReplayDemo />,
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function liveSteps() {
    async function prepare(assert: IAssert) {
        await delay(120);
        assert.ok(true, 'the workspace is ready');
        return {orderId: 'order-42'};
    }
    async function load(assert: IAssert) {
        await delay(180);
        assert.ok(true, 'the catalog is loaded');
        return {lines: 3};
    }
    async function price(assert: IAssert, context: Record<string, unknown>) {
        const [order, catalog] = (await Promise.all([context.prepare, context.load])) as [
            {orderId: string},
            {lines: number},
        ];
        await delay(90);
        assert.equal(catalog.lines, 3, 'all three lines are priced');
        return {orderId: order.orderId, total: 42};
    }
    async function commit(assert: IAssert, context: Record<string, unknown>) {
        const priced = (await context.price) as {total: number};
        await delay(70);
        assert.equal(priced.total, 42, 'the total is committed');
        return {committed: true};
    }
    return Object.assign([prepare, load, price, commit], {name: 'live flow'});
}

function LiveDemo() {
    const [run, setRun] = useState(() =>
        pendingBrowserRun({
            name: 'live flow',
            method: 'test.live.flow',
            steps: liveSteps() as never,
        }),
    );
    useEffect(() => {
        const source = new BrowserTestRunSource({
            name: 'live flow',
            method: 'test.live.flow',
            steps: liveSteps() as never,
        });
        const unsubscribe = source.subscribe(() => setRun(source.snapshot()));
        void source.start();
        return () => {
            unsubscribe();
            void source.stop();
        };
    }, []);
    return (
        <Frame>
            <TestRun
                run={run}
                defaultDetailsOpen
            />
        </Frame>
    );
}

/** A real in-page executor run (the host registry and gateway wiring are phase 2's next step). */
export const Live: Story = {
    render: () => <LiveDemo />,
};

function failingSteps() {
    async function fail(assert: IAssert) {
        assert.equal(1, 2, 'a demonstration failure');
    }
    return Object.assign([fail], {name: 'failing flow'});
}

function PageDemo() {
    return (
        <Frame>
            <TestRunPage
                catalog={[
                    {method: 'test.live.flow', name: 'live flow'},
                    {method: 'test.live.fail', name: 'failing flow'},
                ]}
                load={async method =>
                    (method.endsWith('.fail') ? failingSteps() : liveSteps()) as never
                }
                defaultDetailsOpen
                capture
            />
        </Frame>
    );
}

/** The picker page: a catalog, a run button and the console below it. */
export const Page: Story = {
    render: () => <PageDemo />,
};

const MID_RUN_AT = 520;
const midRunRecording = sessionFlowRecording();
const midRun = replayTo(midRunRecording, MID_RUN_AT);

/** Frozen mid-flight: two steps have run, one is running, the rest are still pending. */
export const MidRun: Story = {
    render: () => (
        <Frame>
            <TestRun
                run={midRun}
                now={midRun.startedAt + MID_RUN_AT}
            />
        </Frame>
    ),
    play: async ({canvasElement}) => {
        const view = within(canvasElement);
        const user = userEvent.setup();
        await user.click(await view.findByTestId('test-run-step-refreshToken'));
        await user.click(await view.findByText('Details'));
        // The recording carries no log events, so the Log tab is empty at mid-run; this proves
        // the selected step's details opened @@F-577.
        await view.findByText('No log entries or assertions');
    },
};

/** The final, successful state. */
export const Completed: Story = {
    render: () => (
        <Frame>
            <TestRun run={sessionFlowRun()} />
        </Frame>
    ),
};

/** `refreshToken` failed; its dependents failed with the propagated error. */
export const Failure: Story = {
    render: () => (
        <Frame>
            <TestRun run={sessionFlowFailure()} />
        </Frame>
    ),
};

/** 40 synthetic steps in six groups, for the density target. */
export const Dense: Story = {
    render: () => (
        <Frame>
            <TestRun run={denseRun()} />
        </Frame>
    ),
};

/** The root group collapsed; its envelope bar still shows when the scenario ran. */
export const Collapsed: Story = {
    render: () => (
        <Frame>
            <TestRun
                run={sessionFlowRun()}
                defaultCollapsed={['group:']}
            />
        </Frame>
    ),
};

/** The initial state before the first step starts. */
export const Pending: Story = {
    render: () => (
        <Frame>
            <TestRun run={sessionFlowPending()} />
        </Frame>
    ),
};

/** A scenario with no steps. */
export const Empty: Story = {
    render: () => (
        <Frame>
            <TestRun
                run={emptyTestRun({
                    runId: 'run-empty',
                    name: 'empty run',
                    method: 'test.empty.flow',
                    status: 'pending',
                })}
            />
        </Frame>
    ),
};

/** The scenario could not be built; the run fails before any step. */
export const Error: Story = {
    render: () => (
        <Frame>
            <TestRun
                run={emptyTestRun({
                    runId: 'run-error',
                    name: 'broken run',
                    method: 'test.broken.flow',
                    status: 'failed',
                    error: {message: 'the scenario could not be built'},
                })}
            />
        </Frame>
    ),
};

/** 720 px viewport: the cards stack and the details panel stays at the bottom. */
export const Narrow: Story = {
    render: () => (
        <Frame width={720}>
            <TestRun run={sessionFlowRun()} />
        </Frame>
    ),
};

/** The details panel open on the failed step, with source links resolved against a web base. */
export const Details: Story = {
    render: () => (
        <Frame>
            <TestRun
                run={sessionFlowFailure()}
                defaultSelectedKey="refreshToken"
                defaultDetailsOpen
                sourceLink={{
                    scheme: 'https',
                    base: 'https://github.com/feasibleone/blong/blob/main',
                }}
            />
        </Frame>
    ),
};
