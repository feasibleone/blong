/**
 * The guards a participant keeps on the two things it cannot choose: what a
 * caller sends it and what a downstream answers with.
 *
 * The happy path (`happy.test.ts`) and the faults (`faults.test.ts`) between
 * them reach every branch of the participants the two flows are built from,
 * except these. Each is a fallback for a state the in-repo fixtures never
 * produce — a caller that sends no body at all, a provider that reports success
 * without a rate, a payee that refuses without naming a reason, a proxy deployed
 * without a receiving link — and no test that drives `startFlow` alone can enter
 * them, because `startFlow`'s own driver always sends a full body, its own
 * participants always answer in the local shape, and it always wires the
 * corridor it was asked for.
 *
 * None of them is hypothetical. All are states a real deployment meets — a
 * malformed client, a third-party FXP, a payee behind a proxy, a corridor that
 * is not configured — so each guard is **exercised rather than deleted**: a
 * guard no deployment can reach is a mechanism that can never fire, which is the
 * defect class this plan exists to close.
 *
 * A guard is reached the way it is reached in production: by changing what the
 * participant is **deployed against**, never by adding a branch inside one. The
 * awkward-shaped peer is a stand-in server outside the flow — a third-party
 * peer, which is what the hub really talks to — handed to the shipped
 * participant factory through the same URL option a deployment configures. The
 * participant under test is the one that ships.
 *
 * Every assertion is made against an observable consequence: the status the
 * caller receives, the request the downstream actually received, and the record
 * the participant retained. A test whose subject can never fire reads as green,
 * so nothing here is satisfied by a branch having been entered.
 */

import {createServer} from 'node:http';
import {mkdtemp, readdir, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import t from 'tap';

import type {LogRecord} from '../../src/record.ts';
import {getWriter, setWriter} from '../../src/writer.ts';
import {installHub} from '../../flow/hub.ts';
import {installHubA} from '../../flow/hubA.ts';
import {installPayer} from '../../flow/payer.ts';
import {createParticipant, type Participant} from '../../flow/participant.ts';
import {installProxy} from '../../flow/proxy.ts';

/**
 * The participants log to stdout by default; silence the destination so these
 * runs cannot be mistaken for tap's own output. The records are still retained
 * in the caches — a writer chooses the destination, not whether the artifact is
 * kept.
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

/** The record one participant emitted under one message, if it emitted one. */
function find(records: LogRecord[], service: string, msg: string): LogRecord | undefined {
    return records.find(record => record.service === service && record.msg === msg);
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

interface StubAnswer {
    status: number;
    /** Sent verbatim, so a test can choose a shape no in-repo fixture produces. */
    body: string;
    contentType?: string;
}

interface Stub {
    url: string;
    /** What the participant actually put on the wire, one entry per request. */
    received(path: string): unknown[];
    /**
     * Re-arm the answer for a path. A peer that answers differently on a second
     * request is what makes an *order* of requests observable — the only way to see
     * whether state a participant keeps belongs to the request or to the participant.
     */
    answer(path: string, next: StubAnswer): void;
    close(): Promise<void>;
}

/**
 * A downstream peer that answers one fixed shape and records what it was asked.
 *
 * It stands in for the third-party service the participant would be pointed at
 * in a real deployment: that peer's response shape is not the participant's to
 * choose, which is exactly why the participant guards against it.
 */
async function stub(answers: Record<string, StubAnswer>): Promise<Stub> {
    const seen = new Map<string, unknown[]>();
    const server = createServer((request, response) => {
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
            const path = request.url ?? '/';
            const raw = Buffer.concat(chunks).toString('utf8');
            // An absent body is recorded as `undefined` rather than as `{}`: the
            // guards under test exist for exactly that difference.
            const sent: unknown = raw.length === 0 ? undefined : JSON.parse(raw);
            seen.set(path, [...(seen.get(path) ?? []), sent]);

            const answer = answers[path] ?? {status: 404, body: '{"error":"no such route"}'};
            response.writeHead(answer.status, {'content-type': answer.contentType ?? 'application/json'});
            response.end(answer.body);
        });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    return {
        url: `http://127.0.0.1:${port}`,
        received(path): unknown[] {
            return seen.get(path) ?? [];
        },
        answer(path, next): void {
            answers[path] = next;
        },
        close(): Promise<void> {
            return new Promise<void>(resolve => server.close(() => resolve()));
        },
    };
}

interface Deployed {
    participant: Participant;
    url: string;
    /** The participant's own records, flushed and read back out of its store. */
    records(): Promise<LogRecord[]>;
    close(): Promise<void>;
}

/**
 * Deploy one shipped participant on a free port, wired to whatever `install` is
 * handed. The flow kind is a deployment property too, so a participant that only
 * exists in the inter-scheme topology is deployed under that kind.
 */
async function deploy(
    name: string,
    install: (participant: Participant) => void,
    kind = 'transfer.single',
): Promise<Deployed> {
    const cacheDir = await mkdtemp(join(tmpdir(), 'semantic-log-flow-guard-'));
    const participant = await createParticipant({
        name,
        kind,
        port: 0,
        cacheDir,
        level: 'info',
    });
    install(participant);
    const url = await participant.listen();
    return {
        participant,
        url,
        async records(): Promise<LogRecord[]> {
            await participant.logger.flush();
            return retained(participant);
        },
        async close(): Promise<void> {
            await participant.close();
            await rm(cacheDir, {recursive: true, force: true});
        },
    };
}

/**
 * POST over the wire. With `body` omitted the request carries **no body and no
 * content type at all** — not an empty object — which is the caller state the
 * participants' `request.body ?? {}` guards exist for.
 */
async function post(url: string, path: string, body?: unknown): Promise<{status: number; body: unknown}> {
    const response = await fetch(`${url}${path}`, {
        method: 'POST',
        headers: body === undefined ? {} : {'content-type': 'application/json'},
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {status: response.status, body: await response.json().catch(() => undefined)};
}

t.test('a caller that sends no body gets the payer defaults, and they reach the hub', async t => {
    const downstream = await stub({
        '/parties': {status: 200, body: '{"currency":"EUR"}'},
        '/quotes': {status: 200, body: '{"rate":1.1,"condition":"sha256:condition"}'},
        '/transfers': {status: 200, body: '{"fulfilment":"sha256:preimage"}'},
    });
    try {
        const payer = await deploy('payer', participant => installPayer(participant, {hubUrl: downstream.url}));
        try {
            const result = await post(payer.url, '/transfer');
            t.equal(result.status, 200, 'a caller that sent nothing is served, not answered with a 500');
            t.same(result.body, {status: 'settled'}, 'and the transfer settles on the defaults');

            // The hop payload is the observable consequence of each default: it is
            // what the payer actually put on the wire, recorded by the peer.
            t.same(downstream.received('/parties'), [{target: 'msisdn-1'}], 'the discovery hop asks for a party');
            t.same(
                downstream.received('/quotes'),
                [{amount: 100, from: 'USD', to: 'EUR'}],
                'the quote hop carries the default amount and currency',
            );
            t.same(
                downstream.received('/transfers'),
                [{amount: 100, currency: 'USD'}],
                'and so does the transfer it submits',
            );

            const records = await payer.records();
            t.equal(find(records, 'payer', 'looking up payee')?.fields?.amount, 100, 'the record names that amount');
            t.equal(find(records, 'payer', 'requesting fx quote')?.fields?.from, 'USD', 'and that currency');
        } finally {
            await payer.close();
        }
    } finally {
        await downstream.close();
    }
});

t.test('a body-less request to the hub is answered: the quote assembles and the transfer settles', async t => {
    const downstream = await stub({
        '/quotes': {status: 200, body: '{"rate":1.1,"condition":"sha256:condition"}'},
        '/transfers': {status: 200, body: '{"fulfilment":"sha256:preimage"}'},
    });
    try {
        const hub = await deploy('hub', participant =>
            installHub(participant, {fxpUrl: downstream.url, payeeUrl: downstream.url}),
        );
        try {
            const quote = await post(hub.url, '/quotes');
            t.equal(quote.status, 200, 'a quote request with no body is served, not answered with a 500');
            t.same(quote.body, {rate: 1.1, condition: 'sha256:condition'}, 'and it still assembles the quote');

            const transfer = await post(hub.url, '/transfers');
            t.equal(transfer.status, 200, 'a transfer with no body is served too');
            t.same(transfer.body, {status: 'settled'}, 'and it settles');

            const records = await hub.records();
            // `find` returns `undefined` when no such record exists, so asserting only on
            // `?.fields?.amount` would pass just as readily if the call site had been
            // deleted. The record existing is asserted first for exactly that reason.
            const received = find(records, 'hub', 'quote request received');
            t.ok(received, 'the hub recorded the quote request it forwarded');
            t.equal(
                received?.fields?.amount,
                undefined,
                'the quote record names no amount: the caller supplied none, and nothing was invented',
            );
            // And the wire, which is what the guard actually protects: an absent body has
            // to reach the provider as an empty object rather than as `undefined`, which
            // is sent as no body at all.
            t.same(
                downstream.received('/quotes')[0],
                {},
                'the provider received a collapsed empty body, not an absent one',
            );
            t.equal(
                find(records, 'hub', 'provider declined the quote'),
                undefined,
                'no provider was asked to decline: an absent body is not a refusal',
            );
        } finally {
            await hub.close();
        }
    } finally {
        await downstream.close();
    }
});

t.test('a provider that reports success without a rate still yields a quote the payer can price', async t => {
    // What a third-party FXP can answer with: a success that names a condition
    // but no rate. The hub's own provider never does — which is why no run of
    // the shipped topology reaches this guard.
    const downstream = await stub({
        '/quotes': {status: 200, body: '{"condition":"sha256:condition"}'},
    });
    try {
        const hub = await deploy('hub', participant =>
            installHub(participant, {fxpUrl: downstream.url, payeeUrl: downstream.url}),
        );
        try {
            const quote = await post(hub.url, '/quotes', {amount: 100, from: 'USD', to: 'EUR'});
            t.equal(quote.status, 200, 'the provider said success, so the hub answers with a quote');
            t.same(
                quote.body,
                {rate: 1, condition: 'sha256:condition'},
                'and the quote carries a numeric rate rather than an absent one the payer would misread',
            );

            const records = await hub.records();
            t.equal(
                find(records, 'hub', 'quote assembled')?.fields?.rate,
                1,
                'the rate it published is the rate it recorded',
            );
        } finally {
            await hub.close();
        }
    } finally {
        await downstream.close();
    }
});

t.test('a payee that refuses without naming a reason is still attributed to the payee', async t => {
    // A refusal that is a status with no reason in it, as a proxy or a bare
    // refusal from a peer that does not implement the route would be.
    const downstream = await stub({
        '/transfers': {status: 422, body: '{}'},
    });
    try {
        const hub = await deploy('hub', participant =>
            installHub(participant, {fxpUrl: downstream.url, payeeUrl: downstream.url}),
        );
        try {
            const result = await post(hub.url, '/transfers', {amount: 100, currency: 'USD'});
            t.equal(result.status, 502, "the hub reports the payee's refusal as a failure of the settlement");
            t.same(result.body, {reason: 'unknown'}, 'and hands the payer a reason, not an empty one');

            const failed = find(await hub.records(), 'hub', 'settlement failed');
            t.equal(failed?.res?.status, 422, "the payee's own status reaches the hub rather than a hub timeout");
            t.equal(
                failed?.err?.message,
                'payee refused: unknown',
                'and the failure is attributed to the payee even though the payee named no reason',
            );
            t.equal(
                failed === undefined ? undefined : releasedSettlement(failed)?.payeeResponse,
                'unknown',
                'the settlement detail the hub released says the same, so nothing reads back as undefined',
            );
        } finally {
            await hub.close();
        }
    } finally {
        await downstream.close();
    }
});

t.test('a proxy deployed with no receiving link holds, and records why (PRD R11)', async t => {
    // The only way to reach this branch is the way a deployment does: hand the
    // proxy no corridor. `startFlow` always wires the link it was asked for, so no
    // run of the inter-scheme flow can enter it — which is exactly why the guard
    // is exercised here instead of left as an `if` nothing reaches.
    const proxy = await deploy('proxy', participant => installProxy(participant, {hubBUrl: ''}), 'transfer.inter');
    try {
        const held = await post(proxy.url, '/transfers', {amount: 100});
        t.equal(held.status, 503, 'the hold is answered as a failure, not as a 200 carrying the envelope');
        t.same(held.body, {reason: 'no route to target ecosystem'}, 'and the caller is told which failure it is');

        const records = await proxy.records();
        const refused = find(records, 'proxy', 'no route to the target ecosystem');
        t.ok(refused, 'the participant recorded the hold rather than failing silently');

        // R11: the reason lives in the record, and the alternative that was
        // considered is as much part of it as the branch taken — a rationale naming
        // only the outcome could not be replayed without reading this file.
        t.equal(refused?.decision?.discriminator, 'route-selection', 'the record names the discriminator consulted');
        t.equal(refused?.decision?.chosen, 'hold', 'and the branch it took');
        t.same(refused?.decision?.candidates, ['hubB', 'hold'], 'and both routes considered, the reaching one included');
    } finally {
        await proxy.close();
    }
});

t.test('a body-less request to the inter-scheme hub is answered, not a 500', async t => {
    const downstream = await stub({
        '/parties': {status: 200, body: '{"currency":"EUR"}'},
        '/quotes': {status: 200, body: '{"rate":1.1,"condition":"sha256:condition"}'},
        '/transfers': {status: 200, body: '{"fulfilment":"sha256:preimage"}'},
    });
    try {
        // Both peers are stubs: which proxy and which provider a hub crosses to is a
        // deployment decision, so it is exactly what the guard is deployed against.
        const hubA = await deploy(
            'hubA',
            participant => installHubA(participant, {proxyUrl: downstream.url, fxpUrl: downstream.url}),
            'transfer.inter',
        );
        try {
            t.equal((await post(hubA.url, '/parties')).status, 200, 'a party lookup with no body is served');
            t.equal((await post(hubA.url, '/quotes')).status, 200, 'a quote with no body is served');
            t.equal((await post(hubA.url, '/transfers')).status, 200, 'and so is a transfer');

            // The consequence, not the fact of the call: the corridor still received a
            // well-formed empty body rather than the participant throwing on undefined.
            t.same(
                downstream.received('/quotes'),
                [{}, {}],
                'the local indication and the corridor quote both carried the absent body as an empty object',
            );
            const records = await hubA.records();
            t.ok(
                find(records, 'hubA', 'cross-scheme quote requested'),
                'and the participant retained its record rather than throwing before it wrote one',
            );
        } finally {
            await hubA.close();
        }
    } finally {
        await downstream.close();
    }
});

t.test('withheld detail belongs to the execution that withheld it, not to the next failure (PRD R10)', async t => {
    // Two requests through one participant, in an order no flow produces: a
    // settlement that *succeeds* — leaving the hub's routing detail and liquidity
    // reservation in its withheld bag — and then a quote whose provider declines,
    // which is the next `error` that hub emits.
    //
    // This is the only shape in which the bag's scope is observable. If it belonged
    // to the participant rather than to the request, that unrelated quote failure
    // would publish the earlier settlement's routing and liquidity under a trace and
    // a flow id that never reserved anything — the detail R10 exists to hold back,
    // released somewhere it does not belong.
    const downstream = await stub({
        '/quotes': {status: 409, body: '{"reason":"rate above provider limit"}'},
        '/transfers': {status: 200, body: '{"fulfilment":"sha256:preimage"}'},
    });
    try {
        const hub = await deploy('hub', participant =>
            installHub(participant, {fxpUrl: downstream.url, payeeUrl: downstream.url}),
        );
        try {
            const settled = await post(hub.url, '/transfers', {amount: 100, currency: 'USD'});
            t.equal(settled.status, 200, 'a settlement succeeds, so nothing is released yet');

            const quote = await post(hub.url, '/quotes', {amount: 100, from: 'USD', to: 'EUR'});
            t.equal(quote.status, 409, 'and a later quote is declined by the provider');

            const records = await hub.records();
            const refused = find(records, 'hub', 'provider declined the quote');
            t.ok(refused, 'the hub recorded the declined quote');
            t.same(
                refused === undefined ? undefined : released(refused),
                [],
                "and released none of the earlier settlement's detail: the bag is the request's, not the participant's",
            );

            // The control, so the assertion above cannot pass because nothing is ever
            // released: a failure in the *same* step does release that step's detail.
            downstream.answer('/transfers', {status: 422, body: '{"reason":"account blocked"}'});
            const failed = await post(hub.url, '/transfers', {amount: 100, currency: 'USD'});
            t.equal(failed.status, 502, 'a settlement that fails is reported as a failure');
            const aftermath = await hub.records();
            const failure = find(aftermath, 'hub', 'settlement failed');
            t.ok(
                failure === undefined ? undefined : released(failure).some(entry => entry.liquidity !== undefined),
                "and that execution's own liquidity reservation is released with it",
            );
        } finally {
            await hub.close();
        }
    } finally {
        await downstream.close();
    }
});
