import {describe, expect, it, vi} from 'vitest';
import {sessionFlowRecording} from './fixtures/sessionFlow.js';
import type {ITestRunEventPage, ITestRunServerTransport} from './pollingTestRunSource.js';
import {PollingTestRunSource} from './pollingTestRunSource.js';

function replayedTransport(pageSize = 5): ITestRunServerTransport & {
    cancelled: string[];
} {
    const recording = sessionFlowRecording();
    const cancelled: string[] = [];
    return {
        cancelled,
        start: vi.fn(async () => ({
            runId: 'run-1',
            run:
                recording.events[0].event.kind === 'run:start'
                    ? recording.events[0].event.run
                    : recording.final,
        })),
        events: vi.fn(async (_runId: string, cursor: number): Promise<ITestRunEventPage> => {
            const remaining = recording.events.filter(entry => (entry.event.cursor ?? 0) > cursor);
            const slice = remaining.slice(0, pageSize);
            return {
                events: slice.map(entry => ({cursor: entry.event.cursor, event: entry.event})),
                done: slice.length === remaining.length,
            };
        }),
        snapshot: vi.fn(async () => recording.final),
        cancel: vi.fn(async (runId: string) => {
            cancelled.push(runId);
        }),
    };
}

describe('PollingTestRunSource', () => {
    it('polls the event log until the run ends', async () => {
        const transport = replayedTransport(4);
        const source = new PollingTestRunSource({
            transport,
            method: 'test.session.flow',
            pollIntervalMs: 0,
        });
        const events: string[] = [];
        source.subscribe(event => events.push(event.kind));
        await source.start();
        const run = source.snapshot();
        expect(run.status).toBe('completed');
        expect(run.counts.completed).toBe(11);
        expect(run.assertions).toEqual({total: 39, threw: 0});
        expect(events[0]).toBe('run:start');
        expect(events[events.length - 1]).toBe('run:end');
        expect(transport.events).toHaveBeenCalled();
    });

    it('cancels the server run', async () => {
        const transport = replayedTransport(1);
        const source = new PollingTestRunSource({
            transport,
            method: 'test.session.flow',
            pollIntervalMs: 10,
        });
        void source.start();
        await new Promise(resolve => setTimeout(resolve, 20));
        await source.cancel();
        expect(transport.cancel).toHaveBeenCalledWith('run-1');
    });

    it('turns a transport error into a failed model', async () => {
        const transport: ITestRunServerTransport = {
            start: vi.fn(async () => ({
                runId: 'run-2',
                run: sessionFlowRecording().final,
            })),
            events: vi.fn(async () => {
                throw new Error('cursor read failed');
            }),
            snapshot: vi.fn(async () => sessionFlowRecording().final),
            cancel: vi.fn(async () => undefined),
        };
        const source = new PollingTestRunSource({
            transport,
            method: 'test.session.flow',
            pollIntervalMs: 0,
        });
        await source.start();
        expect(source.snapshot().status).toBe('failed');
        expect(source.snapshot().error?.message).toContain('cursor read failed');
    });
});
