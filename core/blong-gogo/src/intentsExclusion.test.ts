import {server} from '@feasibleone/blong';
import {test} from 'tap';

import load from './loadServer.ts';

/**
 * A suite may declare intents that must not run together, and the loader refuses the combination
 * before it merges a single source. The refusal is the whole point: two members of a group merge
 * their configuration blocks in the order given and the later one wins where they overlap, so a
 * process started with `dev release` is neither a developer's run nor a released one, and no line
 * of log says which of the two it became.
 *
 * `pkg` is supplied so the loader skips its `createRequire(mod.url)('./package.json')` lookup, and
 * every load is stopped because `dev` and `integration` open the semantic-log cluster service, which
 * listens on a socket — the note in `exit.intent.test.ts` covers what an unstopped registry does to
 * a tap process.
 */
const suite = (intentsExclusionGroups?: readonly (readonly string[])[]) =>
    server(
        () =>
            ({
                url: import.meta.url,
                pkg: {name: 'intents-exclusion-test', version: '0.0.0'},
                children: [],
                ...(intentsExclusionGroups ? {intentsExclusionGroups} : {}),
                config: {default: {}},
            }) as never,
    );

/** Load and stop: the assertion is whether the load settles at all, not what it produced. */
const loadWith = async (
    configNames: string[],
    intentsExclusionGroups?: readonly (readonly string[])[],
): Promise<void> => {
    const registry = await load(
        suite(intentsExclusionGroups) as unknown as Parameters<typeof load>[0],
        'intents-exclusion-test',
        {},
        configNames,
    );
    await registry.stop();
};

test('a combination the entry calls exclusive is refused', async t => {
    await t.rejects(
        loadWith(['dev', 'release'], [['dev', 'release']]),
        /dev and release exclusive/,
        'and the message names both intents, so the command line is the answer',
    );
    t.end();
});

test('one member of a group at a time is what the group allows', async t => {
    const groups = [['dev', 'release']] as const;
    await t.resolves(loadWith(['release'], groups), 'release alone');
    await t.resolves(loadWith(['dev'], groups), 'dev alone');
    t.end();
});

test('an unrelated intent beside one member is still allowed', async t => {
    await t.resolves(
        loadWith(['release', 'debug'], [['dev', 'release']]),
        'the group is about its own members, not about the length of the command line',
    );
    t.end();
});

test('a suite that declares no group keeps its command line', async t => {
    await t.resolves(loadWith(['dev', 'integration', 'microservice']));
    t.end();
});
