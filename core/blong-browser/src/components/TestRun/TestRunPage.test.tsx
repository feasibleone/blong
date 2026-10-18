import type {IAssert} from '@feasibleone/blong';
import {describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen, waitFor} from '../../test/render.js';
import {pendingBrowserRun} from './browserTestRunSource.js';
import type {ITestRunServerTransport} from './pollingTestRunSource.js';
import {TestRunPage} from './TestRunPage.js';

const sampleSteps = () =>
    Object.assign(
        [
            async function sample(assert: IAssert) {
                assert.ok(true, 'sample passes');
                return 1;
            },
        ],
        {name: 'sample flow'},
    );

describe('TestRunPage', () => {
    it('runs a catalog scenario and shows its assertions', async () => {
        const load = vi.fn(async () => sampleSteps() as never);
        render(
            <TestRunPage
                catalog={[{method: 'test.sample.flow', name: 'sample flow'}]}
                load={load}
                defaultDetailsOpen
            />,
        );
        fireEvent.click(screen.getByRole('button', {name: /^Run$/}));
        await waitFor(() => {
            expect(screen.getAllByText('completed').length).toBeGreaterThan(0);
        });
        expect(load).toHaveBeenCalledWith('test.sample.flow');
        expect(screen.getByText('sample passes')).toBeInTheDocument();
    });

    it('never runs without a catalog entry', () => {
        const load = vi.fn(async () => sampleSteps() as never);
        render(
            <TestRunPage
                catalog={[]}
                load={load}
            />,
        );
        const run = screen.getByRole('button', {name: /^Run$/});
        expect(run).toBeDisabled();
        fireEvent.click(run);
        expect(load).not.toHaveBeenCalled();
        expect(screen.getByText('Select a scenario and run it')).toBeInTheDocument();
    });

    it('shows a loader failure instead of crashing', async () => {
        const load = vi.fn(async () => {
            throw new Error('registry refused');
        });
        render(
            <TestRunPage
                catalog={[{method: 'test.sample.flow', name: 'sample flow'}]}
                load={load}
            />,
        );
        fireEvent.click(screen.getByRole('button', {name: /^Run$/}));
        expect(await screen.findByRole('alert')).toHaveTextContent('registry refused');
    });

    it('polls a server-hosted run to its verdict', async () => {
        const initial = {
            ...pendingBrowserRun({name: 'server flow', method: 'test.server.flow', steps: []}),
            host: 'server' as const,
            status: 'running' as const,
        };
        const done = {...initial, status: 'completed' as const};
        const transport: ITestRunServerTransport = {
            start: vi.fn(async () => ({runId: 'server-run', run: initial})),
            events: vi.fn(async () => ({
                events: [{cursor: 1, event: {kind: 'run:end' as const, cursor: 1, run: done}}],
                done: true,
            })),
            snapshot: vi.fn(async () => done),
            cancel: vi.fn(async () => undefined),
        };
        render(
            <TestRunPage
                catalog={[{method: 'test.server.flow', name: 'server flow', host: 'server'}]}
                transport={transport}
            />,
        );
        fireEvent.click(screen.getByRole('button', {name: /^Run$/}));
        await waitFor(() => {
            expect(screen.getAllByText('completed').length).toBeGreaterThan(0);
        });
        expect(transport.start).toHaveBeenCalledWith('test.server.flow', {});
        expect(transport.events).toHaveBeenCalledWith('server-run', -1);
    });

    it('cancels a server-hosted run when the page unmounts', async () => {
        const initial = {
            ...pendingBrowserRun({name: 'server flow', method: 'test.server.flow', steps: []}),
            host: 'server' as const,
            status: 'running' as const,
        };
        const transport: ITestRunServerTransport = {
            start: vi.fn(async () => ({runId: 'server-run', run: initial})),
            events: vi.fn(async () => ({events: [], done: false})),
            snapshot: vi.fn(async () => initial),
            cancel: vi.fn(async () => undefined),
        };
        const {unmount} = render(
            <TestRunPage
                catalog={[{method: 'test.server.flow', name: 'server flow', host: 'server'}]}
                transport={transport}
            />,
        );
        fireEvent.click(screen.getByRole('button', {name: /^Run$/}));
        await waitFor(() => expect(transport.start).toHaveBeenCalled());
        unmount();
        await waitFor(() => expect(transport.cancel).toHaveBeenCalledWith('server-run'));
    });
});
