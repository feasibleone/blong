import {server} from '@feasibleone/blong';
import {test} from 'tap';

import load from './loadServer.ts';

/**
 * The `ci` block is a captured run's configuration — colours off, Allure results
 * written — and a CI run is one by definition, so `activeConfigs` activates the
 * block for it whether or not the entry named the intent.
 *
 * What made this worth a test: only the entries that remembered to pass `ci` in CI
 * wrote Allure results, so a package whose only runner is tap produced no report and
 * the CI summary had nothing to link for it. The observable here is the same trick
 * `exit.intent.test.ts` uses — a config key that only the `ci` block sets — because
 * the resolved `watch.allure.enabled` is not exposed on the registry.
 *
 * Only `load` is exercised, never `start`: the assertions are about which config
 * blocks merged. Every load is stopped, since the `integration` intent opens the
 * semantic-log cluster service and a registry that is never stopped leaves the suite
 * reporting `timeout!` instead of passing (`exit.intent.test.ts` explains it at
 * length).
 */

/**
 * The suite the load is built from. `pkg` is supplied so the loader skips its
 * `createRequire(mod.url)('./package.json')` lookup, and `parentConfig` is an object
 * rather than a name so the test does not depend on the working directory.
 */
const suite = (config: object) =>
    server(
        () =>
            ({
                url: import.meta.url,
                pkg: {name: 'ci-intent-test', version: '0.0.0'},
                children: [],
                config: {default: {}, ...config},
            }) as never,
    );

/** The `exit` the run resolves, with `ci` as the only thing that sets it. */
async function exitWithCiBlock(intents: string[]): Promise<boolean | undefined> {
    const registry = await load(
        suite({ci: {exit: true}}) as unknown as Parameters<typeof load>[0],
        'ci-intent-test',
        {},
        intents,
    );
    try {
        return registry.exit;
    } finally {
        await registry.stop();
    }
}

/** Run `fn` with `CI` set the way a runner sets it, and restore it afterwards. */
async function withCi<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
    const previous = process.env['CI'];
    if (value === undefined) delete process.env['CI'];
    else process.env['CI'] = value;
    try {
        return await fn();
    } finally {
        if (previous === undefined) delete process.env['CI'];
        else process.env['CI'] = previous;
    }
}

test('a CI run activates the ci block without being asked', async t => {
    t.equal(
        await withCi('true', () => exitWithCiBlock([])),
        true,
        'the block merged although no intent named it',
    );
    t.equal(
        await withCi('true', () => exitWithCiBlock(['dev', 'integration'])),
        true,
        'the intents a run normally passes do not take it away',
    );
});

test('a run that is not CI needs the intent', async t => {
    // `false`, not `undefined`: the registry always carries a boolean once loaded.
    // Deleting `CI` rather than inheriting it, because this suite runs in CI itself.
    t.equal(
        await withCi(undefined, () => exitWithCiBlock([])),
        false,
        'the block stays out of a run whose output is watched',
    );
    t.equal(
        await withCi(undefined, () => exitWithCiBlock(['ci'])),
        true,
        'and naming it still does what it always did',
    );
});
