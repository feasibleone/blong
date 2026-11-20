/**
 * The fault matrix: what each deployment fault makes of a run.
 *
 * Every assertion below reads the records the participants wrote during the run — not a service's
 * counts, not the store's folded shapes — because the question a fault asks is *which participant
 * recorded what, and in which order*. `startFlow`'s `onRecord` is that seam: the writer the fixtures
 * hand every record to, which is the same record a deployment writes.
 *
 * The faults are deployment properties, not branches a test steers a participant into: the point of
 * each one is that the code is unchanged and the behaviour is different because the deployment is.
 */

import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import t from 'tap';

import {startFlow, type FlowFaults, type FlowKind} from '../../flow/flows.ts';
import {createParticipant} from '../../flow/participant.ts';
import {installProxy, proxyVocabulary} from '../../flow/proxy.ts';
import type {LogRecord} from '../../src/record.ts';

/** One record as the fixture saw it, with the participant that wrote it. */
interface IObserved {
    participant: string;
    record: LogRecord;
}

/** The identifier a record names, which is the declaration the call site reached. */
function signalOf(record: LogRecord): string | undefined {
    return (record as {signal?: string}).signal;
}

/** Run one flow with a fault and hand back every record it wrote, in order. */
async function run(
    kind: FlowKind,
    faults: FlowFaults,
): Promise<{status: number; observed: IObserved[]}> {
    const cacheDir = await mkdtemp(join(tmpdir(), 'lukaot-faults-'));
    const observed: IObserved[] = [];
    const flow = await startFlow(kind, {
        cacheDir,
        faults,
        onRecord: (participant, record) => observed.push({participant, record}),
    });
    try {
        const result = await flow.run();
        return {status: result.status, observed};
    } finally {
        await flow.close();
        await rm(cacheDir, {recursive: true, force: true, maxRetries: 3}).catch(() => undefined);
    }
}

/** The observations that name one declared signal, in the order they were written. */
function of(observed: IObserved[], signal: string): IObserved[] {
    return observed.filter(item => signalOf(item.record) === signal);
}

t.test('F1 — a refusal at the payee is what the run is attributed to', async t => {
    const {status, observed} = await run('single', {blockTransfers: true});
    t.equal(status, 502, 'the payer answers a failure rather than a settled transfer');

    const refused = of(observed, 'payeeTransferRefused');
    t.equal(refused.length, 1, 'the payee says it refused, once');
    t.equal(refused[0]?.participant, 'payee', 'and it is the payee that says so');
    t.equal(
        refused[0]?.record.fields?.['reason'],
        'account blocked',
        'with the reason the deployment gave it',
    );

    // The hub does not invent a failure of its own: it reports the refusal it was handed, which is
    // what makes the far end the origin rather than the switch in the middle.
    const failed = of(observed, 'hubSettlementFailed');
    t.equal(failed.length, 1, 'the switch records the settlement failing');
    t.match(
        String(failed[0]?.record.fields?.['reason']),
        /payee refused: account blocked/,
        'naming the payee and its reason',
    );

    const rejected = of(observed, 'payerTransferRejected');
    t.equal(rejected.length, 1, 'and the payer records that its transfer was rejected');
    t.ok(
        (refused[0]?.record.time ?? 0) <= (rejected[0]?.record.time ?? 0),
        'the payee spoke before the payer answered',
    );
    t.end();
});

t.test('F2 — a retry is another execution, not a longer one', async t => {
    const {status, observed} = await run('single', {retries: 2});
    t.equal(status, 200, 'the last attempt settles');

    const lookups = of(observed, 'payerPayeeLookupRequested');
    t.equal(lookups.length, 3, 'three attempts are three lookups');
    const executions = new Set(lookups.map(item => item.record.flow?.id));
    t.equal(executions.size, 3, 'each in an execution of its own');
    t.notOk(executions.has(undefined), 'and each one names the execution it belongs to');

    for (const id of executions) {
        const kind = new Set(
            observed
                .filter(item => item.record.flow?.id === id)
                .map(item => item.record.flow?.kind),
        );
        t.same([...kind], ['transfer.single'], `execution ${id} is one kind throughout`);
    }
    t.end();
});

t.test('F4 — a stalled payee is where the flow stopped, and it says so', async t => {
    const {status, observed} = await run('single', {stallTransfers: true});
    t.equal(status, 502, 'the run fails rather than settling');

    const stalled = of(observed, 'payeeTransferStalled');
    t.equal(stalled.length, 1, 'the payee records that it is waiting');
    const failed = of(observed, 'hubSettlementFailed');
    t.equal(failed.length, 1, 'the switch records the settlement failing');
    t.ok(
        (stalled[0]?.record.time ?? 0) <= (failed[0]?.record.time ?? 0),
        'the far end spoke first, so the origin is the payee and not the switch',
    );
    t.end();
});

t.test('F5 — a declined rate is a branch, and the branch is what is recorded', async t => {
    const {status, observed} = await run('single', {declineRate: true});
    t.equal(status, 409, 'the payer answers the refused quote');

    const declined = of(observed, 'fxpRateDeclined');
    t.equal(declined.length, 1, 'the provider records the decline');
    t.equal(declined[0]?.participant, 'fxp', 'from the participant that decides it');

    // Inside the decision: the record carries the branch it was written in, which is what puts it
    // inside the `alt` arm of a diagram rather than beside it.
    const regions = declined[0]?.record.progress?.regions ?? [];
    t.ok(
        regions.some(
            region => region.discriminator === 'rateWithinLimit' && region.chosen === 'decline',
        ),
        'written inside the rateWithinLimit decision, on its decline arm',
    );

    const refused = of(observed, 'payerQuoteRefused');
    t.equal(refused.length, 1, 'the payer then refuses the quote');
    t.ok(
        (declined[0]?.record.time ?? 0) <= (refused[0]?.record.time ?? 0),
        'after the provider declined it',
    );
    t.end();
});

t.test('a corridor with no link holds the call instead of forwarding it', async t => {
    // The one path where a participant holds rather than forwards, and the only way to reach it: the
    // topology always configures a corridor, so the proxy is installed on its own with none.
    const cacheDir = await mkdtemp(join(tmpdir(), 'lukaot-guards-'));
    const records: LogRecord[] = [];
    const participant = await createParticipant({
        name: 'proxy',
        kind: 'transfer.inter',
        port: 0,
        cacheDir,
        vocabulary: proxyVocabulary,
        onRecord: record => records.push(record),
    });
    try {
        installProxy(participant, {hubBUrl: ''});
        const url = await participant.listen();
        const answer = await fetch(`${url}/quotes`, {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({amount: 100, from: 'USD', to: 'EUR'}),
        });
        t.equal(answer.status, 503, 'the caller is told the corridor is not configured');
        t.same(
            await answer.json(),
            {reason: 'no route to target ecosystem'},
            'with the reason, not a thrown failure',
        );
        const held = records.filter(record => signalOf(record) === 'proxyNoRouteToTarget');
        t.equal(held.length, 1, 'and the proxy records the held call');
        t.equal(held[0]?.fields?.['corridor'], 'hubB', 'naming the corridor it could not reach');
    } finally {
        await participant.close();
        await rm(cacheDir, {recursive: true, force: true, maxRetries: 3}).catch(() => undefined);
    }
    t.end();
});
