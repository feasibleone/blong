/**
 * Where a declared signal goes, proved end to end (`@@T-718`).
 *
 * Three reach points, and the realm is the only place that can prove all three at once:
 *
 * - the **store** keeps the shape the *declared identifier* names, so a reference resolves after the
 *   process is gone;
 * - the **service** lists the signal and the flow its tick opened, so a reader sees a session without
 *   being told which record to look at;
 * - the **printed line** carries a reference, and `inspectLine` resolves it back to the record — the
 *   step between "a terminal printed this" and "here is what it was", which nothing could answer
 *   before (`inspect.ts`).
 *
 * The store is a temporary directory and the service binds a port the operating system chooses, so the
 * test is hermetic in the two things it asserts on. The database is the realm's own: a tick claims a
 * ticket and writes its session, which is what every other group here does too.
 *
 * What it caught, and why it is a test rather than a review: the sink refused every record this
 * framework wrote (the identifier travelled as a field, not as the record's identity), a realm-level
 * vocabulary never reached the port that answers it, and `lib.checkpoint?.(…)` threw outside a
 * recording mode. None of them was visible to a unit test of any single piece.
 */

import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import load from '@feasibleone/blong-gogo';
import {inspectLine, inspectStore} from '@feasibleone/lukaot/inspect';
import {
    openCache,
    parseReference,
    setWriter,
    type LogRecord,
    type Writer,
} from '@feasibleone/lukaot/node';
import {test} from 'tap';

import serverSuite from '../index.ts';

const intents = ['microservice', 'integration', 'dev', ...(process.env.CI ? ['ci'] : [])];
const dir = await mkdtemp(join(tmpdir(), 'lukaot-agent-'));
const manifest: Record<string, unknown> = {};
/** Every line the process printed, with the record it was rendered from. */
const printed: Array<{line: string; record?: LogRecord}> = [];
const collect: Writer = {
    write: (line, record) => {
        printed.push({line, record});
    },
};
setWriter(collect);
const platform = await load(
    serverSuite as never,
    'blong-agent',
    {
        // The store this run keeps is the test's own, and the service is asked for a free port: two
        // runs of this package on one machine must not read each other's records.
        log: {cache: {dir, limit: 500}, cluster: {enabled: true, port: 0}, color: false},
        // The realm's own groups, because the converted handler is exercised by what the realm does
        // with it: the session group drives a resume, a suspension and a native run, and the one-step
        // group below adds the empty-account branch. A test that reached the log with a stub would
        // prove nothing about the lines a deployment writes.
        watch: {
            test: ['test.agent.session', 'test.agent.recovery', 'test.agent.observability'],
        },
    } as never,
    intents,
    manifest as never,
);
await platform.start({});
await platform.test(undefined);
setWriter(null);
const clusterUrl = (manifest as {clusterUrl?: string}).clusterUrl;
const waitFor = async (probe: () => Promise<boolean>, deadlineMs = 5_000): Promise<boolean> => {
    const until = Date.now() + deadlineMs;
    while (Date.now() < until) {
        if (await probe()) return true;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    return false;
};

await test('the declared signals reach the store, the service and the line', async t => {
    t.ok(clusterUrl, 'the process started a service for its records');
    // The service receives the records over a socket and counts them as they arrive, so this waits for
    // the one thing it is asked: the signal the tick announced, under the name the realm declares.
    const listed = await waitFor(async () => {
        const templates = (await (await fetch(`${String(clusterUrl)}/templates`)).json()) as Array<{
            ref?: string;
        }>;
        return templates.some(entry => entry.ref === 'agentTicketClaimed');
    });
    t.ok(listed, 'the service lists agentTicketClaimed under its declared name');

    const claim = printed.find(entry => entry.record?.fields?.signal === 'agentTicketClaimed');
    t.ok(claim, 'and the line that announced it was printed');
    const reference = claim && parseReference(claim.line);
    t.ok(reference, `the line carries a reference (${claim?.line.trim() ?? 'no line'})`);

    const inspection = claim && (await inspectLine(dir, claim.line));
    t.equal(inspection?.resolved, true, 'and lukaot inspect resolves it against the store');
    t.equal(
        (inspection?.record?.fields as {signal?: string} | undefined)?.signal,
        'agentTicketClaimed',
        'to the record the declared identifier names',
    );

    // The flow the tick opened. The ledger attributes a signal to the execution it was written under
    // — by the call, not by the record's own trace — so what is asked is the execution that carries
    // this signal and the leg the tick ran as. That is what makes a session's diagram drawable from
    // what the worker said.
    const executions = (await (await fetch(`${String(clusterUrl)}/flows`)).json()) as {
        executions?: Array<{id?: string; kind?: string; refs?: string[]; legs?: string[]}>;
    };
    const session = (executions.executions ?? []).find(
        execution => execution.refs?.includes('agentTicketClaimed') === true,
    );
    t.ok(session, 'and the flow ledger lists the execution the claim belongs to');
    t.equal(session?.kind, 'agent.worker.tick', 'which is the tick the worker ran');
    t.ok(
        (session?.legs ?? []).includes('agent.worker.tick'),
        'with the call the claim was announced under',
    );

    t.end();
});

await platform.stop();

await test('the store keeps the shapes under their declared names', async t => {
    const ids = await inspectStore(dir);
    const store = await openCache({dir, limit: 500, readOnly: true});
    const records: LogRecord[] = [];
    for (const id of ids) {
        const record = await store.get(id);
        if (record !== undefined) records.push(record);
    }
    await store.close();
    const signals = records
        .map(record => (record.fields as {signal?: string} | undefined)?.signal)
        .filter((signal): signal is string => typeof signal === 'string');
    t.ok(signals.includes('agentTicketClaimed'), 'the claim is retained');
    t.ok(signals.includes('agentSessionResumed'), 'and the resume the inbox pass performed');
    t.ok(
        records.some(record => record.refs?.trace !== undefined),
        'and a record that belongs to the execution is retained beside it',
    );
    const placeholders = records
        .map(record => record.msg ?? '')
        .filter(message => /\?\w+\?/.test(message));
    t.same(placeholders, [], 'no retained message kept a placeholder nobody interpolated');
    t.end();
});

// The store is temporary, so it is removed — but a write another hand still owes is not this test's
// to fail on: `maxRetries` rides out a content directory that is being settled, and a directory left
// behind in `tmpdir()` is tidier than a green test reported red.
await rm(dir, {recursive: true, force: true, maxRetries: 10, retryDelay: 100}).catch(
    () => undefined,
);
