import {server} from '@feasibleone/blong';
import {test} from 'tap';

import load from './loadServer.ts';

/**
 * The process-lifetime decision is declared per intent in `load.ts` and resolved
 * onto the registry, so a runner can ask the registry instead of pattern-matching
 * intent names (which is what `runServer` used to do with
 * `process.env.CI && !intents.includes('playwright')`).
 *
 * Only `load` is exercised, never `start`, so nothing binds a port and no
 * watcher is created — the assertions here are about the flag, and the
 * "no listener" property is checked by actually running `blong cli`.
 */

/**
 * `pkg` is supplied so the loader skips its `createRequire(mod.url)('./package.json')`
 * lookup, which needs a real on-disk package next to the entry point.
 */
const suite = () =>
    server(
        () =>
            ({
                url: import.meta.url,
                pkg: {name: 'exit-intent-test', version: '0.0.0'},
                children: [],
                config: {default: {}},
            }) as never,
    );

/**
 * `parentConfig` is passed as an object rather than a name on purpose: a string
 * routes through ConfigRuntime's external config-file lookup, which is irrelevant
 * here and would make the test depend on the working directory.
 */
async function exitFor(intents: string[]): Promise<boolean | undefined> {
    const registry = await load(
        suite() as unknown as Parameters<typeof load>[0],
        'exit-intent-test',
        {},
        intents,
    );
    return registry.exit;
}

test('cli and db are short-lived', async t => {
    t.equal(await exitFor(['cli']), true, 'a CLI does its work and exits');
    t.equal(await exitFor(['db']), true, 'schema creation / seeding exits');
});

test('playwright is long-lived regardless of other intents', async t => {
    t.equal(await exitFor(['playwright']), false, 'the webServer owns the process lifetime');
    // The precedence that matters: `integration` is short-lived in CI, and adding
    // `playwright` must override it — this is exactly what the old
    // `!intents.includes('playwright')` clause did.
    const previous = process.env.CI;
    process.env.CI = '1';
    try {
        t.equal(await exitFor(['integration']), true, 'integration exits in CI');
        t.equal(
            await exitFor(['integration', 'playwright']),
            false,
            'a later intent overrides an earlier one',
        );
        // Declares nothing, so it resolves to false — the registry always
        // carries a boolean once loaded, and `undefined` only appears on
        // implementations that do not set it at all.
        t.equal(await exitFor(['dev']), false, 'dev declares no lifetime');
    } finally {
        if (previous === undefined) delete process.env.CI;
        else process.env.CI = previous;
    }
});

test('integration keeps its CI-only lifetime', async t => {
    const previous = process.env.CI;
    delete process.env.CI;
    try {
        t.equal(await exitFor(['integration']), false, 'outside CI the process keeps running');
    } finally {
        if (previous !== undefined) process.env.CI = previous;
    }
});

test('the cli intent turns off everything that would outlive a command', async t => {
    // Asserted through the flag it implies plus the fact that loading still
    // succeeds: the individual keys are read by the infra-item filter, not by
    // anything the registry exposes.
    const registry = await load(
        suite() as unknown as Parameters<typeof load>[0],
        'exit-intent-test',
        {},
        ['cli'],
    );
    t.equal(registry.exit, true, 'short-lived');
    t.ok(Array.isArray(registry.describe?.().realms), 'the realm still loaded');
});
