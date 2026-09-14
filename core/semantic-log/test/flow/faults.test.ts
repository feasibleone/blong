/**
 * The fault branches of the single-scheme flow (F1, F4, F5).
 *
 * A fault here is a **deployment property**: it is handed to `startFlow` and the
 * participant is installed with it, exactly as a real deployment would be
 * configured. Nothing steers a participant from the outside and nothing adds a
 * test-only branch inside one — the flow under test is the flow that ships.
 *
 * Each test asserts the fault's **observable consequence**: the status the
 * caller receives, the record the responsible participant retained, and the
 * detail a failure releases. A branch that fired with nothing visible afterwards
 * would read as green, which is the class of defect this plan exists to catch.
 *
 * **Scope.** These tests exercise branches Task 4's happy path leaves unentered.
 * The *fidelity* of F1–F5 — whether each fault is attributed, escalated and
 * withheld correctly end to end — is Plan 3 Task 6's subject and is deliberately
 * not claimed here.
 *
 * The sequencing reason they are in this task at all: coverage counts a module
 * only once a test loads it, so `flow/*.ts` was uncounted until `happy.test.ts`
 * imported the participants — and the moment one test did, the fault branches a
 * *later* task owns became this task's debt.
 */

import {mkdtemp, readdir, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';

import t from 'tap';

import type {LogRecord} from '../../src/record.ts';
import {renderHuman} from '../../src/render.ts';
import {createApp} from '../../src/service/app.ts';
import {DetectorSuite} from '../../src/service/detectors.ts';
import {createServiceWriter} from '../../src/service/transport.ts';
import {getWriter, setWriter} from '../../src/writer.ts';
import {startFlow, type FlowFaults, type FlowHandle} from '../../flow/flows.ts';
import type {Participant} from '../../flow/participant.ts';

/**
 * The participants log to stdout by default; silence the destination so the
 * fault runs cannot be mistaken for tap's own output. The records are still
 * retained in the caches — a writer chooses the destination, not whether the
 * artifact is kept.
 */
const RESTORE_WRITER = getWriter();
t.beforeEach(() => setWriter(null));
t.afterEach(() => setWriter(RESTORE_WRITER));

/** Every record the participant retained, read back out of the store it wrote. */
async function retained(participant: Participant): Promise<LogRecord[]> {
    const dir = join(participant.cacheDir, 'records');
    const files = await readdir(dir).catch(() => [] as string[]);
    const records: LogRecord[] = [];
    for (const file of files) {
        records.push(JSON.parse(await readFile(join(dir, file), 'utf8')) as LogRecord);
    }
    return records;
}

/**
 * A cache root for the test, removed when the test ends.
 *
 * Needed alongside `runWithFaults` because the faults that make a claim **across
 * runs** — a reword that forks a template, a burst measured against a quiet
 * baseline — have to drive two runs, and the claim is only about those runs if
 * their stores are separate.
 */
async function root(t: {teardown: (fn: () => Promise<void>) => void}): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-flow-fault-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    return dir;
}

interface FaultRun {
    flow: FlowHandle;
    result: {status: number; body: unknown};
    /** Every record every participant retained, in no particular order. */
    records: LogRecord[];
}

/**
 * Drive one real execution of the flow **with faults configured** and read back
 * everything it produced.
 *
 * The loggers are flushed before the caches are read: a record's write is queued
 * a tick after the log call returns, so without the flush the run's last record —
 * the failure the run exists to demonstrate — would still be in flight.
 */
async function runWithFaults(faults: FlowFaults, fn: (run: FaultRun) => Promise<void>): Promise<void> {
    const cacheDir = await mkdtemp(join(tmpdir(), 'semantic-log-flow-fault-'));
    const flow = await startFlow('single', {cacheDir, faults});
    try {
        const result = await flow.run();
        for (const participant of flow.participants) {
            await participant.logger.flush();
        }
        const records: LogRecord[] = [];
        for (const participant of flow.participants) {
            records.push(...(await retained(participant)));
        }
        await fn({flow, result, records});
    } finally {
        await flow.close();
        await rm(cacheDir, {recursive: true, force: true});
    }
}

/** The record one participant emitted under one message, if it emitted one. */
function find(records: LogRecord[], service: string, msg: string): LogRecord | undefined {
    return records.find(record => record.service === service && record.msg === msg);
}

/**
 * Every record every participant of a flow retained — including a **closed** one,
 * whose store is still on disk.
 *
 * Reading after `close` is what lets two runs be compared, which is the only way
 * an identity claim across a deploy (R12) or a shape change across one (R6c) can
 * be tested at all: the claim is about the two runs' templates, not about one.
 */
async function collected(flow: FlowHandle): Promise<LogRecord[]> {
    const records: LogRecord[] = [];
    for (const participant of flow.participants) {
        records.push(...(await retained(participant)));
    }
    return records;
}

/** Every detail bag a record released, each keyed by the participant that withheld it. */
function released(record: LogRecord): Record<string, unknown>[] {
    const bag = record.fields?.withheld;
    if (!Array.isArray(bag)) {
        return [];
    }
    return (bag as Array<{fields?: Record<string, unknown>}>).map(entry => entry.fields ?? {});
}

/** The `settlement` detail a failure record released, or undefined when it released none. */
function releasedSettlement(record: LogRecord): {attempted?: number; payeeResponse?: string} | undefined {
    const found = released(record).find(fields => fields.settlement !== undefined);
    return found?.settlement as {attempted?: number; payeeResponse?: string} | undefined;
}

t.test('F5: a declined rate stops the chain at the provider and nothing settles', async t => {
    await runWithFaults({declineRate: true}, async ({result, records}) => {
        t.equal(result.status, 409, 'the payer refuses the quote rather than settling on a rate nobody offered');

        const declined = find(records, 'fxp', 'rate declined');
        t.ok(declined, 'the provider recorded its own refusal');
        t.equal(declined?.levelName, 'warn', 'a refusal is a warning, not a failure of the provider');
        t.equal(declined?.fields?.rate, 1.1, 'the refused rate is in the record');
        t.equal(declined?.fields?.rateLimit, 1.15, 'and so is the limit it exceeded, so the branch is attributable');
        t.equal(find(records, 'fxp', 'rate published'), undefined, 'declineAll published no rate at all');

        // R11 is this fault's whole reason for existing, and it is the one thing the
        // other assertions here do not reach: they pin *that* the provider refused,
        // not *why the branch it took was the one it took*. The rationale is taken by
        // the next record the declining logger emits, which is the refusal above.
        t.equal(
            declined?.decision?.discriminator,
            'rate-within-limit',
            'the provider recorded which discriminator it consulted',
        );
        t.equal(declined?.decision?.chosen, 'decline', 'and the branch it took');
        t.same(declined?.decision?.candidates, ['decline', 'accept'], 'and both branches it considered');
        t.same(
            declined?.decision?.values,
            {rate: 1.1, rateLimit: 1.15},
            'with the values the decision was made on, so it can be replayed from the record alone',
        );

        const hub = find(records, 'hub', 'provider declined the quote');
        t.ok(hub, 'the hub recorded that the provider declined');
        t.equal(hub?.res?.status, 409, "the hub carries the provider's status instead of synthesising a rate");
        t.equal(hub?.err?.message, 'fxp returned 409', 'and names the provider as the source');
        t.equal(find(records, 'hub', 'quote assembled'), undefined, 'no quote was assembled from a declined rate');

        const payer = find(records, 'payer', 'quote refused');
        t.ok(payer, 'the payer recorded its refusal');
        t.equal(payer?.fields?.reason, 'rate above limit', 'the payer refused on the rate it did not receive');
        t.equal(find(records, 'payer', 'quote accepted'), undefined, 'no quote was accepted');

        t.equal(find(records, 'payer', 'submitting transfer'), undefined, 'no transfer was ever submitted');
        t.equal(find(records, 'hub', 'settlement committed'), undefined, 'nothing settled');
        t.equal(find(records, 'hub', 'settlement failed'), undefined, 'and nothing failed to settle: the chain stopped at the quote');
    });
});

t.test('F3: a reworded message is the one recorded, and the old wording is gone (PRD R6c)', async t => {
    await runWithFaults({rewordLiquidity: true}, async ({result, records}) => {
        t.equal(result.status, 200, 'rewording a message does not disturb the transfer');

        const reworded = find(records, 'hub', 'liquidity hold placed');
        t.ok(reworded, "the hub recorded the deploy's wording, not the one compiled in");
        t.equal(reworded?.fields?.amount, 100, 'and the reworded record still carries the amount it reserved');
        t.equal(find(records, 'hub', 'liquidity reserved'), undefined, 'the previous wording is not recorded at all');

        t.equal(find(records, 'hub', 'settlement committed')?.res?.status, 200, 'the transfer still settles');
    });
});

t.test('F1: a refused transfer is attributed to the payee and the hub releases what it withheld', async t => {
    await runWithFaults({blockTransfers: true}, async ({result, records}) => {
        t.equal(result.status, 502, 'the payer reports the failure it was told about');

        const refused = find(records, 'payee', 'transfer refused');
        t.ok(refused, 'the payee recorded the refusal');
        t.equal(refused?.levelName, 'error', 'the refusal is the origin of the failure');
        t.equal(refused?.err?.message, 'account blocked', 'the origin names its own reason');

        const failed = find(records, 'hub', 'settlement failed');
        t.ok(failed, 'the hub recorded the failed settlement');
        t.equal(failed?.res?.status, 422, "the payee's own status reaches the hub rather than a hub timeout");
        t.equal(failed?.err?.message, 'payee refused: account blocked', 'and the failure is attributed to the payee');

        // Withholding is the hub's whole reason for holding routing and liquidity
        // locally: the detail is released onto the failure, and only then.
        const settlement = failed === undefined ? undefined : releasedSettlement(failed);
        t.ok(settlement, 'the failure record carries the settlement detail the hub withheld before the hop');
        t.equal(settlement?.attempted, 100, 'the released detail names the amount that failed');
        t.equal(settlement?.payeeResponse, 'account blocked', 'and the reason the payee gave');
        const routing = failed === undefined ? undefined : released(failed).find(fields => fields.routing !== undefined);
        t.ok(routing, 'the routing detail withheld earlier in the step is released with it');
        t.ok(
            failed === undefined ? undefined : released(failed).find(fields => fields.liquidity !== undefined),
            'and so is the liquidity it reserved',
        );

        const rejected = find(records, 'payer', 'transfer rejected');
        t.ok(rejected, 'the payer recorded the rejection');
        t.equal(rejected?.res?.status, 502, 'the payer saw the hub fail');
        t.equal(rejected?.err?.message, 'hub returned 502');

        t.equal(find(records, 'hub', 'settlement committed'), undefined, 'the settlement is never reported as committed');
    });
});

t.test('F4: a stalled payee is attributed to the payee and its wait is recorded', async t => {
    await runWithFaults({stallTransfers: true}, async ({result, records}) => {
        t.equal(result.status, 502, 'the payer reports the failure the hub passed on');

        const waiting = find(records, 'payee', 'transfer awaiting fulfilment');
        t.ok(waiting, 'the stalled payee recorded that it never answered');
        t.equal(waiting?.levelName, 'warn', 'a stall is a warning at the far end');
        t.equal(waiting?.fields?.waitedMs, 50, 'the wait it imposed is in the record');
        // R9: the other half of what this fault exists to make visible — not that the
        // payee was slow, but that the record says *which step* it was slow in, so a
        // reader knows how far the transfer got before it stopped.
        t.equal(waiting?.flow?.step, 'transfer', 'and the step it stalled inside is recorded');
        t.equal(find(records, 'payee', 'transfer fulfilled'), undefined, 'the transfer was never fulfilled');

        const failed = find(records, 'hub', 'settlement failed');
        t.ok(failed, 'the hub recorded the failed settlement');
        t.equal(failed?.res?.status, 504, "the stall reaches the hub as the payee's own 504, not a hub timeout");
        t.equal(failed?.err?.message, 'payee refused: no fulfilment', 'and is attributed to the payee');
        t.equal(
            failed === undefined ? undefined : releasedSettlement(failed)?.payeeResponse,
            'no fulfilment',
            'the detail the hub withheld on the failure names the stall',
        );

        t.equal(find(records, 'payer', 'transfer rejected')?.res?.status, 502, 'the payer recorded the rejection');
        t.equal(find(records, 'hub', 'settlement committed'), undefined, 'nothing settled');
    });
});

t.test('a flow with no cache root creates its own and retains records there (PRD R18)', async t => {
    const flow = await startFlow('single');
    try {
        const result = await flow.run();
        t.equal(result.status, 200, 'the flow runs on the root it created for itself');

        for (const participant of flow.participants) {
            await participant.logger.flush();
        }
        const records: LogRecord[] = [];
        for (const participant of flow.participants) {
            records.push(...(await retained(participant)));
        }
        t.ok(records.length > 0, 'and the records are retained under that root, not discarded');

        for (const participant of flow.participants) {
            t.match(
                participant.cacheDir,
                /semantic-log-flow-/,
                `${participant.name} retains under the auto-created root`,
            );
        }
        const roots = new Set(flow.participants.map(participant => dirname(participant.cacheDir)));
        t.equal(roots.size, 1, 'every participant of one flow shares the one root the flow created');
    } finally {
        const roots = new Set(flow.participants.map(participant => dirname(participant.cacheDir)));
        await flow.close();
        for (const root of roots) {
            await rm(root, {recursive: true, force: true});
        }
    }
});

t.test('F2: a retry burst is one template at a rate-shift, not 41 new templates (PRD R6b, R12)', async t => {
    // The fault is the retry; the requirements are what the service makes of it. A
    // burst the service reported as 41 novel templates would satisfy any test that
    // only counted attempts, so both halves are asserted.
    //
    // The rate baseline is per template and is made of **completed windows**, so a
    // surge can only be scored once a baseline exists. One quiet execution runs
    // first and the test crosses a window boundary before the burst: without both,
    // the burst becomes its own baseline and is compared against itself. The window
    // is set to *this fixture's* timescale — the shipped default is five completed
    // **60-second** windows, which no test-length run can fill (see `todo.md`).
    const dir = await root(t);
    const service = createApp({
        detectors: new DetectorSuite({
            drift: {epsilon: 0.25, learningRate: 0.2},
            rate: {windowMs: 120, buckets: 1, zThreshold: 4},
        }),
    });
    let sink: ReturnType<typeof createServiceWriter> | undefined;
    try {
        const address = await service.listen({port: 0, host: '127.0.0.1'});
        sink = createServiceWriter({url: address});

        const quiet = await startFlow('single', {cacheDir: join(dir, 'quiet')});
        await quiet.run();
        await quiet.close();
        for (const record of await collected(quiet)) {
            sink.write(renderHuman(record), record);
        }

        // Past a window boundary, so the quiet window closes and becomes the baseline.
        await new Promise(resolve => setTimeout(resolve, 160));

        const burst = await startFlow('single', {cacheDir: join(dir, 'burst'), faults: {retries: 40}});
        const result = await burst.run();
        await burst.close();
        const burstRecords = await collected(burst);
        for (const record of burstRecords) {
            sink.write(renderHuman(record), record);
        }
        await sink.flush();

        t.equal(result.status, 200, 'every retry settles: the burst is rate, not failure');
        const attempts = burstRecords.filter(
            record => record.service === 'payer' && record.msg === 'submitting transfer',
        );
        t.equal(attempts.length, 41, 'the driver really retried — one attempt for the first try and each of the 40');

        // R12 in miniature: 41 executions of unchanged code are ONE identifier. A
        // driver that minted a template per attempt would make the burst invisible and
        // the registry unbounded.
        const templates = new Set(attempts.map(record => record.refs.template));
        t.equal(templates.size, 1, 'PRD R12: 41 occurrences of unchanged code share one template identifier');

        const digest = (await service.inject({method: 'GET', url: '/digest?since=0'})).json() as {
            entries: Array<{kind: string; data: {kind?: string; anomalyRef?: string; time?: number}}>;
        };
        const shifts = digest.entries.filter(entry => entry.kind === 'anomaly' && entry.data.kind === 'rate-shift');
        t.ok(shifts.length > 0, 'PRD R6b: the burst is reported as a rate-shift');
        t.ok(
            shifts.some(entry => entry.data.anomalyRef !== undefined && templates.has(entry.data.anomalyRef)),
            'and it is stamped on the template the payer repeated rather than on a new one',
        );
        // Bounded to the burst: the quiet run's own first occurrences are novelty by
        // definition, and counting those would make this assertion about the wrong run.
        const burstStart = Math.min(...burstRecords.map(record => record.time));
        const novel = digest.entries.filter(
            entry =>
                entry.kind === 'anomaly' &&
                entry.data.kind === 'novelty' &&
                entry.data.time !== undefined &&
                entry.data.time >= burstStart,
        );
        t.equal(novel.length, 0, 'the burst is not reported as 41 new templates');
    } finally {
        await sink?.flush();
        await service.close();
    }
});

t.test('F3: a reworded message is a template of its own, which is what makes a deploy visible (R6c, R14)', async t => {
    // The plan's own sketch for this fault asserted the opposite — that the template
    // ref survives a reword — and that assertion could never have passed: identity is
    // derived from the masked **message text** (`src/fingerprint.ts`), and `mask`
    // (`src/normalize.ts`) replaces variable *values*, not words. R12's "stable" is
    // about masked variables; what a reword produces is a new template, and that is
    // exactly what R14's deploy diff reports as one added and one gone.
    const dir = await root(t);
    const before = await startFlow('single', {cacheDir: join(dir, 'before')});
    await before.run();
    await before.close();
    const after = await startFlow('single', {cacheDir: join(dir, 'after'), faults: {rewordLiquidity: true}});
    await after.run();
    await after.close();

    const liquidityOf = (all: LogRecord[]): LogRecord | undefined =>
        all.find(record => record.service === 'hub' && record.msg.startsWith('liquidity'));
    const original = liquidityOf(await collected(before));
    const reworded = liquidityOf(await collected(after));
    t.ok(original && reworded, 'both runs recorded the liquidity hold');
    t.not(original?.msg, reworded?.msg, 'the message really changed');
    t.not(original?.fingerprint, reworded?.fingerprint, 'and the identity moved with it');
    t.not(
        original?.refs.template,
        reworded?.refs.template,
        'PRD R6c/R14: the reworded message is its own template, so the deploy is visible as one added and one removed',
    );
});
