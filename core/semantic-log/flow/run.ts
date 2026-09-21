#!/usr/bin/env -S node
/**
 * Run one of the flow fixtures and watch it log.
 *
 * The fixtures are a **demonstration** of the logging library, not an
 * implementation of Mojaloop: they are loosely based on its published FX and
 * inter-scheme features, simplified so that a run produces realistic
 * multi-service traffic. See `docs/blong/docs/patterns/semantic-log-flows.md`
 * for the diagrams and for what is simplified, omitted and added.
 *
 *   semantic-log-flow --flow single
 *   semantic-log-flow --flow inter --fault blockTransfers
 *   semantic-log-flow --flow single --fault retries --count 40
 *   semantic-log-flow --flow single --service http://127.0.0.1:9455
 *
 * The point of the runner is to make the fixtures runnable by hand: the records are
 * retained under `--cache` (a temporary directory by default), so a reference
 * printed during the run can be resolved afterwards with `semantic-log-inspect`.
 * With `--service` the same records are also shipped to a running service, so the
 * digest, incidents and facets can be read while the flow runs. Without it the run
 * is entirely offline (PRD R18) — the service is never a prerequisite.
 *
 * Every argument is validated rather than defaulted, because a mistyped fault name
 * would otherwise produce a run that looks exactly like a successful one. That is
 * the silent no-op this runner exists to make impossible.
 */

import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startFlow, type FlowFaults, type FlowKind} from './flows.ts';

/** The faults that are simply present or absent. */
const FLAGS = ['blockTransfers', 'rewordLiquidity', 'stallTransfers', 'declineRate'] as const;
/** The one fault that carries a value instead. */
const COUNTED = 'retries';

type FlagFault = (typeof FLAGS)[number];

function isFlagFault(name: string): name is FlagFault {
    return (FLAGS as readonly string[]).includes(name);
}

function arg(name: string, fallback?: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : fallback;
}

function fail(message: string): never {
    process.stderr.write(`semantic-log-flow: ${message}\n`);
    process.stderr.write(
        `usage: semantic-log-flow --flow single|inter [--fault ${[...FLAGS, COUNTED].join('|')}]` +
            ' [--count n] [--cache dir] [--service url]\n',
    );
    process.exit(2);
}

const requested = arg('flow', 'single') ?? 'single';
if (requested !== 'single' && requested !== 'inter') {
    fail(`unknown flow "${requested}"`);
}
const kind: FlowKind = requested;

const faults: FlowFaults = {};
const named = arg('fault');
if (named !== undefined) {
    if (isFlagFault(named)) {
        faults[named] = true;
    } else if (named === COUNTED) {
        const raw = arg('count', '40');
        const count = Number(raw);
        if (!Number.isInteger(count) || count < 1) {
            fail(`--count must be a positive integer, got "${raw}"`);
        }
        faults.retries = count;
    } else {
        fail(`unknown fault "${named}"`);
    }
}

const cacheDir = arg('cache') ?? (await mkdtemp(join(tmpdir(), 'semantic-log-flow-')));
const flow = await startFlow(kind, {cacheDir, faults, serviceUrl: arg('service'), level: 'info'});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
        void flow.close().then(() => process.exit(0));
    });
}

process.stdout.write(`flow ${kind} starting (cache ${cacheDir})\n`);
const result = await flow.run();
process.stdout.write(`flow ${kind} finished: ${result.status} ${JSON.stringify(result.body)}\n`);
process.stdout.write(`records retained at ${cacheDir} — resolve one with semantic-log-inspect\n`);
await flow.close();
