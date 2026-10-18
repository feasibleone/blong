import {describe, expect, it} from 'vitest';
import type {ITestRunEvent} from '../../types/testRun.js';
import {BrowserTestRunSource, pendingBrowserRun} from './browserTestRunSource.js';
import type {IAssert} from '@feasibleone/blong';

const stepsWith = (
    ...steps: Array<(assert: IAssert, context: Record<string, unknown>) => Promise<unknown>>
) => Object.assign(steps, {name: 'browser flow'});

describe('BrowserTestRunSource', () => {
    it('runs the steps in the page and projects the run', async () => {
        async function login(assert: IAssert) {
            assert.ok(true, 'login runs');
            return {token: 't'};
        }
        async function verify(assert: IAssert, context: Record<string, unknown>) {
            const {token} = (await context.login) as {token: string};
            assert.equal(token, 't', 'the token flows');
            return token.length;
        }
        const source = new BrowserTestRunSource({
            name: 'browser flow',
            method: 'test.browser.flow',
            steps: stepsWith(login, verify) as never,
            concurrency: 2,
        });
        const events: ITestRunEvent[] = [];
        source.subscribe(event => events.push(event));

        await source.start();
        const run = source.snapshot();

        expect(run.status).toBe('completed');
        expect(run.counts).toEqual({total: 2, pending: 0, running: 0, completed: 2, failed: 0});
        expect(run.assertions).toEqual({total: 2, threw: 0});
        expect(run.steps.login.assertionLog?.[0].message).toBe('login runs');
        expect(run.steps.verify.assertionLog?.[0].message).toBe('the token flows');
        expect(run.steps.verify.assertionLog?.[0].source?.file).toContain(
            'browserTestRunSource.test.ts',
        );
        expect(run.steps.verify.sourceLocation?.file).toContain(
            'browserTestRunSource.test.ts',
        );
        expect(run.edges.map(edge => [edge.from, edge.to])).toEqual([['verify', 'login']]);
        expect(events[0].kind).toBe('run:start');
        expect(events.some(event => event.kind === 'step:dependency')).toBe(true);
        expect(events[events.length - 1].kind).toBe('run:end');
    });

    it('keeps a failing run in the model instead of rejecting', async () => {
        async function fails(assert: IAssert) {
            assert.equal(1, 2, 'one is not two');
        }
        const source = new BrowserTestRunSource({
            name: 'failing flow',
            method: 'test.browser.fail',
            steps: stepsWith(fails) as never,
        });
        await source.start();
        const run = source.snapshot();
        expect(run.status).toBe('failed');
        expect(run.counts.failed).toBe(1);
        expect(run.assertions).toEqual({total: 1, threw: 1});
        expect(run.steps.fails.error?.message).toContain('one is not two');
    });

    it('lets independent steps finish after one fails', async () => {
        const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
        async function fails(assert: IAssert) {
            await delay(5);
            assert.equal(1, 2, 'one is not two');
        }
        async function independent(assert: IAssert) {
            await delay(20);
            assert.ok(true, 'independent finishes');
            return 'done';
        }
        const source = new BrowserTestRunSource({
            name: 'independent flow',
            method: 'test.browser.independent',
            steps: stepsWith(fails, independent) as never,
            concurrency: 2,
        });
        await source.start();
        const run = source.snapshot();
        expect(run.status).toBe('failed');
        expect(run.steps.fails.status).toBe('failed');
        expect(run.steps.independent.status).toBe('completed');
        expect(run.counts).toMatchObject({failed: 1, completed: 1});
    });

    it('keeps declaration order before anything runs', () => {
        async function second() {
            return 2;
        }
        async function first() {
            return 1;
        }
        const steps = stepsWith(second, first) as never;
        const source = new BrowserTestRunSource({
            name: 'order',
            method: 'test.browser.order',
            steps,
        });
        expect(source.snapshot().order).toEqual(['second', 'first']);
        expect(
            pendingBrowserRun({name: 'order', method: 'test.browser.order', steps}).steps.second,
        ).toBeDefined();
    });

    it('bounds a large step result at the projection boundary', async () => {
        async function big(assert: IAssert) {
            assert.ok(true, 'big result');
            return {rows: new Array(20_000).fill('row')};
        }
        const source = new BrowserTestRunSource({
            name: 'bounded',
            method: 'test.browser.bounded',
            steps: stepsWith(big) as never,
        });
        await source.start();
        const step = source.snapshot().steps.big;
        expect(step.resultTruncated).toBe(true);
        expect(step.result).toEqual({truncated: true, bytes: expect.any(Number)});
    });
});
