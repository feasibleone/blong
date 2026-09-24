import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import t from 'tap';
import {openCache} from './cache.ts';
import {
    currentContext,
    currentRegion,
    currentRegions,
    step,
    takeDecision,
    withFlow,
    withIntent,
} from './context.ts';
import {decide} from './decide.ts';
import {createLogger} from './logger.ts';
import type {Writer} from './writer.ts';

const values = {amount: 500, currency: 'EUR'};

/** A valid caller-minted flow ULID — the identity is no longer a readable name. */
const FLOW_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

function capture(): {lines: string[]; writer: Writer} {
    const lines: string[] = [];
    return {lines, writer: {write: (line: string) => void lines.push(line)}};
}

t.test('the chosen branch runs and the rationale is recorded', t => {
    const result = decide('amount-limit', values, [
        {name: 'reject', when: v => (v.amount as number) > 1000, run: () => 'rejected'},
        {name: 'accept', when: () => true, run: () => 'accepted'},
    ]);
    t.equal(result, 'accepted');
    const decision = takeDecision();
    t.equal(decision?.discriminator, 'amount-limit');
    t.equal(decision?.chosen, 'accept');
    t.same(decision?.candidates, ['reject', 'accept'], 'PRD R11: candidates in evaluation order');
    t.same(decision?.values, values);
    t.end();
});

t.test('the recorded decision is taken once, not twice', t => {
    decide('x', {}, [{name: 'only', when: () => true, run: () => 1}]);
    t.ok(takeDecision());
    t.equal(takeDecision(), undefined);
    t.end();
});

t.test('the chosen branch runs inside a region that names it', t => {
    const seen: Array<{id?: string; discriminator?: string; chosen?: string}> = [];
    decide('rate-within-limit', {rate: 1.1}, [
        {name: 'decline', when: () => false, run: () => 'decline'},
        {
            name: 'accept',
            when: () => true,
            run: () => {
                seen.push(currentRegion() ?? {});
                return 'accept';
            },
        },
    ]);
    t.equal(
        seen[0]?.discriminator,
        'rate-within-limit',
        'the branch knows the question it answered',
    );
    t.equal(seen[0]?.chosen, 'accept', 'and which answer it is');
    t.ok(seen[0]?.id, 'and carries a position, so two branches of one kind stay apart');
    t.equal(currentRegion(), undefined, 'the region closes with the branch that opened it');
    t.end();
});

t.test('a nested branch reports the whole chain, outermost first', t => {
    let chain: string[] = [];
    decide('outer', {}, [
        {
            name: 'o',
            when: () => true,
            run: () =>
                decide('inner', {}, [
                    {
                        name: 'i',
                        when: () => true,
                        run: () => {
                            chain = (currentRegions() ?? []).map(region => region.discriminator);
                        },
                    },
                ]),
        },
    ]);
    t.same(chain, ['outer', 'inner'], 'the inner branch does not hide the outer one it sits in');
    t.end();
});

t.test('sibling branches are numbered apart', t => {
    const ids: Array<string | undefined> = [];
    const take = () =>
        decide('sibling', {}, [
            {name: 'a', when: () => true, run: () => void ids.push(currentRegion()?.id)},
        ]);
    take();
    take();
    t.notSame(ids[0], ids[1], 'two branches of one kind are two positions, not one');
    t.end();
});

t.test('a branch whose work throws leaves no region behind', t => {
    t.throws(
        () =>
            decide('boom', {}, [
                {
                    name: 'a',
                    when: () => true,
                    run: () => {
                        throw new Error('handler failed');
                    },
                },
            ]),
        /handler failed/,
    );
    t.equal(
        currentRegion(),
        undefined,
        'the region is scoped to the branch, so the failure ends it',
    );
    t.end();
});

t.test('no branch matching yields a recorded non-choice, not a crash', t => {
    const result = decide('never', values, [{name: 'a', when: () => false, run: () => 'a'}]);
    t.equal(result, undefined);
    t.equal(takeDecision()?.chosen, 'none');
    t.end();
});

t.test('every evaluated branch is recorded, including false ones', t => {
    decide('multi', values, [
        {name: 'first', when: () => false, run: () => 1},
        {name: 'second', when: () => false, run: () => 2},
        {name: 'third', when: () => true, run: () => 3},
    ]);
    t.same(takeDecision()?.candidates, ['first', 'second', 'third']);
    t.end();
});

t.test('no candidates at all is still a recorded non-choice', t => {
    const result = decide('empty', values, []);
    t.equal(result, undefined);
    t.same(takeDecision(), {discriminator: 'empty', candidates: [], chosen: 'none', values});
    t.end();
});

t.test('a throwing predicate propagates and records nothing', t => {
    t.equal(takeDecision(), undefined, 'no rationale is pending before the call');
    t.throws(
        () =>
            decide('boom', values, [
                {
                    name: 'a',
                    when: () => {
                        throw new Error('predicate failed');
                    },
                    run: () => 1,
                },
            ]),
        /predicate failed/,
        'the failure is visible: it is not swallowed and not converted to `none`',
    );
    t.equal(
        takeDecision(),
        undefined,
        'a decision that never completed is not recorded, so no stale rationale can be attached',
    );
    t.end();
});

t.test('a decision is attached to the next record and rendered', t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer});
    decide('quote-valid', {amount: 500}, [
        {name: 'reject', when: v => (v.amount as number) > 1000, run: () => 'reject'},
        {name: 'accept', when: () => true, run: () => 'accept'},
    ]);
    logger.info('quote handled');
    t.match(lines[0], /decision\s+quote-valid -> accept \(of reject, accept\)/);
    t.end();
});

t.test('the rationale lands on exactly one record', t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer});
    decide('one-shot', {n: 1}, [{name: 'yes', when: () => true, run: () => 'yes'}]);
    logger.info('first');
    logger.info('second');
    t.match(lines[0], /decision\s+one-shot -> yes/, 'the next record carries it');
    t.notMatch(lines[1], /decision/, 'the record after that does not repeat it');
    t.end();
});

t.test('a filtered record does not consume a rationale it never carried', t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer, level: 'warn'});
    decide('late', {n: 1}, [{name: 'only', when: () => true, run: () => 1}]);
    logger.debug('filtered away');
    t.equal(lines.length, 0, 'the threshold suppressed the record');
    logger.warn('written');
    t.match(
        lines[0],
        /decision\s+late -> only/,
        'the rationale rides the next record actually emitted',
    );
    t.end();
});

t.test('a decision with no record after it is dropped with its scope', async t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer});
    await withIntent({name: 'Orphan'}, async () => {
        decide('orphan', {}, [{name: 'only', when: () => true, run: () => 1}]);
        t.equal(
            currentContext().pendingDecision?.decision?.discriminator,
            'orphan',
            'it is pending inside the scope',
        );
    });
    logger.info('unrelated');
    t.notMatch(
        lines[0],
        /decision/,
        'no record was emitted in that scope, so the rationale never surfaces',
    );
    t.end();
});

t.test('the rationale is attached before redaction, so patterns reach it', t => {
    const {lines, writer} = capture();
    const logger = createLogger({
        service: 'hub',
        writer,
        format: 'json',
        redact: ['decision.discriminator', 'decision.values'],
    });
    decide('quote-valid', {amount: 500}, [{name: 'reject', when: () => true, run: () => 'reject'}]);
    logger.info('quote handled');
    const parsed = JSON.parse(lines[0]) as {decision?: Record<string, unknown>};
    // If the decision were attached after `redactRecord` these two values would
    // be the originals: the pattern could not reach a subtree added later.
    t.equal(parsed.decision?.discriminator, '[redacted]', 'the discriminator is withholdable');
    t.equal(parsed.decision?.values, '[redacted]', 'the values are withholdable');
    t.equal(parsed.decision?.chosen, 'reject', 'unmatched leaves survive');
    t.notMatch(lines[0], /quote-valid|amount/, 'no trace of the withheld rationale survives');
    t.end();
});

t.test(
    'the rationale is retained with the record and reads back through the cache (PRD R11/R21)',
    async t => {
        // The record is snapshotted at emit time, so a `Decision` that survives
        // redaction must survive `structuredClone` too, or the CLI would read back a
        // record that had lost the rationale it was told about.
        const dir = await mkdtemp(join(tmpdir(), 'semantic-log-decide-'));
        t.teardown(() => rm(dir, {recursive: true, force: true}));
        const cache = await openCache({dir, limit: 10});
        const {lines, writer} = capture();
        const logger = createLogger({service: 'hub', writer, cache});
        decide('round-trip', {n: 1}, [{name: 'only', when: () => true, run: () => 'only'}]);
        logger.info('kept');
        await logger.flush();
        const id = /r=semantic-log:\/\/record\/([0-9A-Z]+)/.exec(lines[0])?.[1] ?? '';
        t.ok(id, 'the line carries the id');
        const stored = await cache.get(id);
        t.equal(stored?.decision?.discriminator, 'round-trip');
        t.equal(stored?.decision?.chosen, 'only');
        t.same(stored?.decision?.candidates, ['only']);
        await cache.close();
    },
);

t.test('a rationale is consumed once, globally, not once per scope', async t => {
    // Regression: `takeDecision` used to clear the pending rationale with
    // `enterWith`, which swaps the store for the *current* scope only. The
    // record emitted inside the flow consumed it, but the enclosing scope's
    // copy still carried it and repeated the rationale on the next record.
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer});
    decide('outer-scope', {n: 1}, [{name: 'only', when: () => true, run: () => 1}]);
    await withFlow({id: FLOW_ID, kind: 'transfer.single'}, async () => {
        logger.info('inside the flow');
    });
    logger.info('outside the flow');
    t.equal(lines.length, 2, 'both records were written');
    t.match(lines[0], /decision\s+outer-scope -> only/, 'the nested record reports the branch');
    t.notMatch(
        lines[1],
        /decision/,
        'the enclosing record does not repeat a rationale the nested scope consumed',
    );
    t.end();
});

t.test('a rationale consumed in any scope-creating helper does not repeat outside it', async t => {
    // `withFlow`, `withIntent` and `step` each rebuild the store by spreading,
    // so each is a place a copied rationale could survive a take. A step is only
    // legal inside a flow (it throws otherwise), so its scope check is nested in
    // one — which is exactly where a caller takes a step.
    const scopes: Array<[string, (emit: () => void) => Promise<void>]> = [
        ['withFlow', emit => withFlow({id: FLOW_ID, kind: 'transfer.single'}, async () => emit())],
        ['withIntent', emit => withIntent({name: 'Checkout'}, async () => emit())],
        [
            'step',
            emit =>
                withFlow({id: FLOW_ID, kind: 'transfer.single'}, () =>
                    step('transfer', async () => emit()),
                ),
        ],
    ];
    for (const [label, run] of scopes) {
        const {lines, writer} = capture();
        const logger = createLogger({service: 'hub', writer});
        decide(label, {n: 1}, [{name: 'only', when: () => true, run: () => 1}]);
        await run(() => logger.info('nested'));
        logger.info('enclosing');
        t.match(
            lines[0],
            new RegExp(`decision\\s+${label} -> only`),
            `${label}: the nested record carries it`,
        );
        t.notMatch(lines[1], /decision/, `${label}: the enclosing record is clean`);
    }
    t.end();
});

t.test('sibling scopes sharing the store cannot both carry one rationale', async t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer});
    decide('sibling', {n: 1}, [{name: 'only', when: () => true, run: () => 1}]);
    await Promise.all([
        (async () => {
            await Promise.resolve();
            logger.info('left');
        })(),
        (async () => {
            await Promise.resolve();
            logger.info('right');
        })(),
    ]);
    t.equal(lines.length, 2, 'both siblings wrote a record');
    t.equal(
        lines.filter(line => /decision/.test(line)).length,
        1,
        'the shared rationale lands on exactly one sibling',
    );
    t.end();
});

t.test('a redaction pattern that collapses the rationale cannot make logging throw', t => {
    // Regression: with a pending decision, `redact: ['**']` / `['decision']`
    // replace the whole slot and `['decision.candidates']` replaces its array
    // with the `[redacted]` string. Identity minting assumed a `Decision` was
    // there and threw a `TypeError` out of `logger.info`.
    for (const pattern of ['**', 'decision', 'decision.candidates']) {
        const {lines, writer} = capture();
        const logger = createLogger({service: 'hub', writer, format: 'json', redact: [pattern]});
        decide('quote-valid', {amount: 500}, [
            {name: 'reject', when: () => true, run: () => 'reject'},
        ]);
        t.doesNotThrow(() => logger.info('quote handled'), `${pattern}: logging does not throw`);
        t.equal(lines.length, 1, `${pattern}: the record is still written`);
        const parsed = JSON.parse(lines[0]) as {decision?: unknown; fingerprint?: string};
        t.ok(parsed.fingerprint, `${pattern}: identity is still minted`);
        if (pattern === 'decision.candidates') {
            t.equal(
                (parsed.decision as {candidates: unknown}).candidates,
                '[redacted]',
                `${pattern}: only the candidate list was withheld`,
            );
        } else {
            t.equal(parsed.decision, '[redacted]', `${pattern}: the whole rationale was withheld`);
            t.notMatch(lines[0], /quote-valid|amount/, `${pattern}: no rationale value survives`);
        }
    }
    t.end();
});

t.test('the default format tolerates a redaction-collapsed rationale', t => {
    // Regression: the earlier guard in `serializeForIdentity` only stopped the
    // `json` format from throwing. The default `human` renderer destructured
    // `record.decision` and called `candidates.join`, so the same patterns
    // still crashed `logger.info` — the earlier test was pinned to
    // `format: 'json'`, which is why this survived.
    for (const pattern of ['**', 'decision', 'decision.candidates']) {
        const {lines, writer} = capture();
        const logger = createLogger({service: 'hub', writer, redact: [pattern]});
        decide('quote-valid', {amount: 500}, [
            {name: 'reject', when: () => true, run: () => 'reject'},
        ]);
        t.doesNotThrow(() => logger.info('quote handled'), `${pattern}: logging does not throw`);
        t.equal(lines.length, 1, `${pattern}: the record is still written`);
        if (pattern === 'decision.candidates') {
            t.match(
                lines[0],
                /decision\s+quote-valid -> reject/,
                `${pattern}: the surviving rationale fields render`,
            );
            t.notMatch(
                lines[0],
                /\[redacted\]/,
                `${pattern}: the collapsed candidate list is omitted, not joined`,
            );
        } else {
            t.match(
                lines[0],
                /decision\s+\[redacted\]/,
                `${pattern}: the withheld rationale keeps its placeholder`,
            );
            t.notMatch(lines[0], /quote-valid|amount/, `${pattern}: no rationale value survives`);
        }
    }
    t.end();
});

t.test('a withheld timestamp renders as an explicit marker in the default format', t => {
    // Regression, independent of the rationale guard: `renderHuman` fed
    // `record.time` to `new Date(...).toISOString()`, so a pattern that
    // collapsed the timestamp (`time`, `**`) threw a `RangeError` out of
    // `logger.info` even with no decision pending.
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer, redact: ['time']});
    t.doesNotThrow(() => logger.info('no rationale here'));
    t.equal(lines.length, 1, 'the record is still written');
    t.match(
        lines[0],
        /^\[time withheld\] /,
        'the timestamp is an explicit marker, not a wrong date',
    );
    t.end();
});
