/**
 * The two flows. The durable record of what each one exercises lives in the
 * docs-site pages: `docs/blong/docs/patterns/semantic-log-flows.md` holds the
 * sequence diagrams annotated leg by leg — including what the fixtures simplify,
 * omit and add — and `docs/blong/docs/patterns/semantic-log.md` is the catalogue
 * of the calls the participants make.
 *
 * **Demonstration only.** These are fixtures for the logging library, not an
 * implementation of Mojaloop and not a payment system. They are loosely based on
 * Mojaloop's published FX and inter-scheme features and simplify the protocol
 * deliberately: three generic POST routes instead of the published resource
 * pairs and oracles, one quote round instead of two, placeholder strings where
 * the real flow carries ILP conditions, and a single withhold in place of
 * two-phase settlement. Read them as traffic that exercises the emitter, never as
 * guidance on settlement.
 *
 * `single` is the four-participant scheme-internal transfer; `inter` adds the
 * cross-border link (hubA → proxy → hubB) from the second diagram.
 *
 * The **kind** is set here rather than minted per request: it names the flow as
 * a recurring process, so it is a deployment property that outlives any run and
 * is the key drift is observed under (PRD R9/R6c). Every participant of one
 * flow runs under the same kind; the execution ULID is minted at the entry
 * point and propagated per request, so one execution is one flow id however
 * many participants it crosses.
 *
 * Two fastify constraints set the order of the wiring below. A route has to be
 * installed *before* its instance listens — fastify refuses to add one to a
 * started instance — and a participant is wired to its downstream by URL, which
 * exists only once the downstream is listening. The topology is therefore
 * installed and brought up **downstream-first**: a participant starts listening
 * only after every participant it calls is reachable.
 *
 * Both branches are wired. `single` is the four participants of the
 * scheme-internal transfer. `inter` inserts the cross-border link
 * (hubA → proxy → hubB) ahead of the receiving scheme, so its handle reports six
 * participants and the payer is pointed at hub A instead of the local hub. A
 * caller asking for `inter` gets the inter-scheme topology or a failure — never
 * the single-scheme one under another name.
 */

import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {LevelName} from '../src/level.ts';
import {installFxp} from './fxp.ts';
import {installHub} from './hub.ts';
import {installHubA} from './hubA.ts';
import {createParticipant, type Participant} from './participant.ts';
import {installPayee} from './payee.ts';
import {installPayer} from './payer.ts';
import {installProxy} from './proxy.ts';

export type FlowKind = 'single' | 'inter';

/** The stable process name each flow runs under — the drift key (PRD R9/R6c). */
const FLOW_KIND: Record<FlowKind, string> = {
    single: 'transfer.single',
    inter: 'transfer.inter',
};

export interface FlowFaults {
    /** F1: the payee refuses the transfer. */
    blockTransfers?: boolean;
    /** F2: the driver retries; the participant is unchanged. */
    retries?: number;
    /** F3: the hub's liquidity message is reworded, as a deploy would. */
    rewordLiquidity?: boolean;
    /** F4: the payee never answers. */
    stallTransfers?: boolean;
    /** F5: the provider declines every rate. */
    declineRate?: boolean;
}

export interface FlowOptions {
    /** Root cache directory; a temporary one is created when omitted. */
    cacheDir?: string;
    /**
     * The level every participant logs at. Typed from the library rather than
     * restated as a literal union, so it cannot drift from the levels the logger
     * actually has.
     */
    level?: LevelName;
    faults?: FlowFaults;
    /**
     * An already-running cluster service, or undefined to run offline (PRD R18).
     *
     * Each participant gets it as a **second** destination, so records are shipped
     * while staying in the local cache. A flow never depends on a service being
     * present: a run with none configured is complete without one.
     */
    serviceUrl?: string;
}

export interface FlowHandle {
    kind: FlowKind;
    payerUrl: string;
    participants: Participant[];
    /** Run the whole transfer; returns the payer's response. */
    run(body?: {
        amount?: number;
        currency?: string;
        target?: string;
    }): Promise<{status: number; body: unknown}>;
    close(): Promise<void>;
}

async function start(participant: Participant): Promise<string> {
    return participant.listen();
}

export async function startFlow(kind: FlowKind, options: FlowOptions = {}): Promise<FlowHandle> {
    const cacheRoot = options.cacheDir ?? (await mkdtemp(join(tmpdir(), 'semantic-log-flow-')));
    const faults = options.faults ?? {};
    const participants: Participant[] = [];

    async function participant(
        name: string,
        role: 'payer' | 'hub' | 'fxp' | 'payee' | 'hubA' | 'proxy' | 'hubB',
    ): Promise<Participant> {
        const created = await createParticipant({
            name,
            kind: FLOW_KIND[kind],
            // Every participant asks the OS for its own free port. A caller-supplied
            // base would have to be offset per participant to avoid `EADDRINUSE` — a
            // feature with no reader yet, so the option is gone rather than wrong for
            // every value but zero (see `.github/memory/todo.md`).
            port: 0,
            cacheDir: join(cacheRoot, name),
            level: options.level ?? 'info',
            intent:
                role === 'payer'
                    ? {name: 'User_Transfer', actor: 'demo', tenant: 'acme'}
                    : undefined,
            serviceUrl: options.serviceUrl,
        });
        participants.push(created);
        return created;
    }

    // The three leaves are common to both topologies: the payer drives whichever
    // one it is pointed at, and the provider and the payee are the far end of
    // either. Only the switch between them differs, so only it is created per
    // branch — a participant created for the branch that does not use it would
    // appear in `participants` and contribute no record, and that list is what a
    // caller reads the topology from.
    const payer = await participant('payer', 'payer');
    const fxp = await participant('fxp', 'fxp');
    const payee = await participant('payee', 'payee');

    let payerUrl = '';
    if (kind === 'single') {
        const hub = await participant('hub', 'hub');
        installPayee(payee, {
            blockTransfers: faults.blockTransfers,
            stallTransfers: faults.stallTransfers,
        });
        installFxp(fxp, {declineAll: faults.declineRate});
        const fxpUrl = await start(fxp);
        const payeeUrl = await start(payee);
        installHub(hub, {fxpUrl, payeeUrl, rewordLiquidity: faults.rewordLiquidity});
        const hubUrl = await start(hub);
        installPayer(payer, {hubUrl, hubName: 'hub'});
        payerUrl = await start(payer);
    } else {
        // Downstream-first, and each participant installed before it starts
        // listening: a fastify instance refuses a route added after it listened,
        // and a participant can only be pointed at a downstream that is already
        // reachable. The corridor is therefore built from the far end back — the
        // leaves, then the receiving scheme's hub, the proxy, and the originating
        // scheme's hub.
        const hubA = await participant('hubA', 'hubA');
        const proxy = await participant('proxy', 'proxy');
        const hubB = await participant('hubB', 'hubB');
        installPayee(payee, {
            blockTransfers: faults.blockTransfers,
            stallTransfers: faults.stallTransfers,
        });
        // One provider per corridor, asked by the receiving scheme's hub — the reference
        // flow's shape. The originating scheme's hub quotes nothing locally: it crosses,
        // and the corridor's price is what the payer settles on.
        installFxp(fxp, {declineAll: faults.declineRate});
        const fxpUrl = await start(fxp);
        const payeeUrl = await start(payee);
        // The receiving scheme's hub owns the payee and the corridor's provider.
        installHub(hubB, {fxpUrl, payeeUrl, rewordLiquidity: faults.rewordLiquidity});
        const hubBUrl = await start(hubB);
        installProxy(proxy, {hubBUrl});
        const proxyUrl = await start(proxy);
        // The originating scheme's hub has no provider of its own and no direct route to
        // the payee: it crosses.
        installHubA(hubA, {proxyUrl});
        const hubAUrl = await start(hubA);
        installPayer(payer, {hubUrl: hubAUrl, hubName: 'hubA'});
        payerUrl = await start(payer);
    }

    return {
        kind,
        payerUrl,
        participants,
        async run(body = {amount: 100, currency: 'USD', target: 'msisdn-1'}) {
            const retries = Math.max(1, (faults.retries ?? 0) + 1);
            let last: {status: number; body: unknown} = {status: 0, body: undefined};
            for (let attempt = 0; attempt < retries; attempt++) {
                const response = await fetch(`${payerUrl}/transfer`, {
                    method: 'POST',
                    headers: {'content-type': 'application/json'},
                    body: JSON.stringify(body),
                });
                last = {
                    status: response.status,
                    body: await response.json().catch(() => undefined),
                };
            }
            return last;
        },
        async close(): Promise<void> {
            // A participant's last record is handed to the cache through the
            // logger's write tracker, which runs the write a tick later. Closing
            // the cache first would therefore let that write arrive after `close`
            // returned — the final record of a run, often the failure the run
            // exists to demonstrate, would be missing from the very cache the
            // reader consults. Flush the loggers before closing anything.
            for (const item of participants) {
                await item.logger.flush();
            }
            for (const item of participants) {
                await item.close();
            }
        },
    };
}
