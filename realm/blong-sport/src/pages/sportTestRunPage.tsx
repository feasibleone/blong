import unchanged from '@feasibleone/blong';
import {
    TestRunPage,
    useBlong,
    type ITestRunEventPage,
    type ITestRunModel,
    type ITestRunServerTransport,
} from '@feasibleone/blong-browser';
import type {IMeta} from '@feasibleone/blong/types';
import React from 'react';
import {sportTestRunCatalog} from './sportTestRunCatalog.js';

/**
 * The browser test groups the catalog can start.
 *
 * They are dynamic imports keyed by the method the catalog names, so Vite bundles
 * each group and the page never imports a group the catalog does not offer.
 */
const testGroups: Record<string, () => Promise<{default: unknown}>> = {
    'test.athlete.flow': () => import('../../browser/test/test/testAthlete.flow.js'),
};

/**
 * TestRunSportPage — the browser test console for the `sport` realm.
 *
 * The catalog is the guard; the loader resolves a catalog method to its browser
 * test group's step array, invoking the group definition with the page's handler
 * proxy so the group's login/access calls reach the gateway. The page ships only
 * with the `test-ui` intent, and it refuses a method that is not in the catalog.
 *
 * The server entry calls the `test.run.*` methods through the UI backend: the UI
 * handler proxy has no sender for the test namespace, while the backend adapter
 * forwards to the gateway.
 */
export function TestRunSportPage() {
    const {handler} = useBlong();
    const backend = handler as unknown as Record<
        string,
        (params: object, meta: IMeta) => Promise<unknown>
    >;

    const transport: ITestRunServerTransport = {
        start: (method: string, $meta: IMeta) =>
            backend['backend/test.run.start']!(
                {method, name: `${method} server`},
                $meta,
            ) as Promise<{runId: string; run: ITestRunModel}>,
        events: (runId: string, cursor: number) =>
            backend['backend/test.run.eventFind']!(
                {runId, cursor},
                {},
            ) as Promise<ITestRunEventPage>,
        snapshot: (runId: string) =>
            backend['backend/test.run.snapshotGet']!({runId}, {}) as Promise<ITestRunModel>,
        cancel: async (runId: string) => {
            await backend['backend/test.run.cancel']!({runId}, {});
        },
    };

    const load = async (method: string) => {
        const module = await testGroups[method]?.();
        if (!module) throw new Error(`no browser test group for ${method}`);
        const definition = module.default as (
            api: unknown,
        ) => Record<string, (params?: object) => unknown>;
        const group = (name: string) => (steps: unknown[]) =>
            Object.defineProperty(steps, 'name', {value: name, enumerable: false});
        const methods = definition({lib: {group}, handler});
        const handlerName = method
            .split('.')
            .filter(Boolean)
            .map((part, index) => (index === 0 ? part : part[0].toUpperCase() + part.slice(1)))
            .join('');
        const invoke = methods[handlerName];
        if (typeof invoke !== 'function') throw new Error(`no test group method for ${method}`);
        // The portal page already holds a session, so the flow exercises the
        // authenticated path instead of the no-cookie refusal.
        const steps = invoke({hasSession: true});
        if (!Array.isArray(steps)) throw new Error(`"${method}" did not return a step array`);
        return steps as never;
    };

    return (
        <TestRunPage
            title="Test runs"
            catalog={sportTestRunCatalog}
            load={load}
            transport={transport}
            defaultDetailsOpen
            capture
        />
    );
}
