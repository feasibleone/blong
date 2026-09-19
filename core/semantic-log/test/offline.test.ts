/**
 * R18 acceptance: output never depends on the cluster service.
 *
 * Nothing in this package configures one, so "service unreachable" is the
 * default state here. These tests assert the stronger property the requirement
 * names — the emit path cannot block on anything and contacts nothing at all —
 * so a network call or a blocking write introduced into an emitter module is a
 * failure rather than something that passes unnoticed. The service half of the
 * package does legitimately reach the network (the remote embedding provider),
 * and that exception is declared rather than skipped: the audit below names the
 * modules that may use the network and asserts that set exactly. The
 * spawned-process test (`test/spawn.test.ts`) carries the other half: a real
 * process writing a real store while nothing is running.
 */

import {readFile, readdir} from 'node:fs/promises';
import t from 'tap';
import type {RecordStore} from '../src/cache.ts';
import {createLogger} from '../src/logger.ts';
import type {LogRecord} from '../src/record.ts';
import {setWriter, stdoutWriter} from '../src/writer.ts';

t.test('a default logger emits with no service configured', t => {
    const writes: string[] = [];
    const original = process.stdout.write;
    // The real stdout is observed rather than avoided: the logger is given no
    // writer at all, so it must reach the process's own destination with no
    // setup — that is what zero-configuration usage means (PRD R18, §5.1).
    process.stdout.write = ((chunk: unknown): boolean => {
        writes.push(String(chunk));
        return true;
    }) as typeof process.stdout.write;
    try {
        createLogger({service: 'hub', now: () => 1757765472345}).info('no service anywhere');
    } finally {
        process.stdout.write = original;
        setWriter(stdoutWriter);
    }
    t.match(
        writes.join(''),
        /no service anywhere/,
        'the record still emits with no service anywhere',
    );
    t.match(
        writes.join(''),
        /r=semantic-log:\/\/record\//,
        'and it still carries a local reference',
    );
    t.end();
});

t.test('a hung cache cannot stall an emit, however large the burst', async t => {
    // A write that never settles is what a cluster service that never answers
    // looks like from here. Nothing in this test opens a socket: the point is
    // that no emit path waits on the store at all. If one did, the burst below
    // could not complete.
    let put = 0;
    const hung: RecordStore = {
        put: (): Promise<void> => {
            put++;
            return new Promise<void>(() => {});
        },
        putSync: (): void => {},
        get: async (): Promise<LogRecord | undefined> => undefined,
        stats: (): {size: number; dropped: number} => ({size: 0, dropped: 0}),
        close: async (): Promise<void> => {},
    };
    const lines: string[] = [];
    // Registered before the process writer is touched at all, so no failure path
    // can leave it installed for the rest of the file. This has to be a teardown
    // rather than the trailing call the test used to make: that call only ran
    // when every assertion above it passed.
    t.teardown(() => setWriter(stdoutWriter));
    setWriter({write: (line: string): void => void lines.push(line)});
    const logger = createLogger({
        service: 'payer',
        level: 'trace',
        cache: hung,
        now: () => 1757765472345,
    });
    // This is the property the test exists for: an emit never waits on the
    // store. Every one of the 10,000 calls has to have returned for the writer
    // to have seen 10,000 records, and the elapsed budget below is far under any
    // plausible store latency — so an emit that blocked (a synchronous store
    // write on the caller's stack) would fail both, by hanging the loop or by
    // blowing the budget. `put` is the deterministic half of that pin.
    const started = Date.now();
    for (let i = 0; i < 10_000; i++) {
        logger.trace('burst', {i});
    }
    const elapsed = Date.now() - started;
    t.equal(lines.length, 10_000, 'every record reached the writer without waiting on the store');
    t.equal(
        put,
        0,
        "the store was not touched on the caller's stack: the write is queued, never awaited",
    );
    t.ok(
        elapsed < 5_000,
        `a 10k burst completes promptly (${elapsed}ms), far below the store's latency`,
    );

    // Unwind the stack: the queued drain now runs. Exactly *one* write is
    // dispatched, and that is the tracker working as designed rather than the
    // burst failing to reach the store: `WriteTracker.track` in `src/logger.ts`
    // pushes each write onto a queue that `drain` empties one entry at a time,
    // so a `put` is only invoked once its predecessor has settled. The store
    // above never settles, so the first write is in flight and the queue behind
    // it is held — outstanding, never concurrent. Asserting all 10,000 were
    // handed over would demand a fan-out the tracker deliberately does not have.
    // (This comment used to attribute the ordering to `enqueue` in
    // `src/cache.ts`. That was wrong twice: this test never loads that module —
    // `hung` above is a hand-written `RecordStore` — and the ordering lives in
    // the tracker.)
    await new Promise<void>(resolve => setImmediate(resolve));
    t.equal(
        put,
        1,
        'exactly one write was dispatched: the serialised queue is held by the store that never answers',
    );

    // The queue is bounded, and its loss is observable rather than silent: the
    // next record reports the writes the bound evicted. This replaces
    // `t.equal(emitted, 10_000, …)`, which asserted the completion of the very
    // loop that incremented `emitted` and so could not fail. `put` stays 1
    // because the bound drops queued writes; it does not fan them out.
    logger.trace('after the burst');
    t.match(
        lines[10_000],
        /writeDropped: 9000/,
        'the bound evicted the oldest 9,000, and the loss is reported',
    );

    const settled = await Promise.race([
        logger.flush().then(() => 'settled'),
        new Promise<string>(resolve => setTimeout(() => resolve('pending'), 10)),
    ]);
    t.equal(
        settled,
        'pending',
        'flush still reports the writes as outstanding, as the store never answered',
    );
    t.end();
});

t.test(
    'only the declared service modules reach the network; every emitter module stays offline',
    async t => {
        // The scan stays total, and that is the point of it. It used to read `src/`
        // one level deep and name one bin file by hand, so `src/service/app.ts`
        // (which imports `fastify`) and `bin/semantic-log-service.ts` were never
        // read at all: the guard kept reporting green while the first module that
        // opens this package to the network sat outside it. Naming paths by hand
        // recreates that hole the next time a file is added, and the cluster
        // service is planned to grow to a dozen modules under `src/service/`, so
        // the directories are walked instead of enumerated. Only shipping sources
        // are walked — `test/` and `*.test.ts` are excluded because a test may
        // legitimately stub a transport — and every module below `src/` or `bin/`,
        // at any depth, is covered without further edits here.
        //
        // The remote embedding provider and the cluster-service sink are genuinely
        // network code, so the audit is scoped rather than narrowed: a declared
        // allowlist names the modules that may contain a network form, and it is
        // asserted to be *exactly* the set of scanned modules that do. It therefore
        // fails in both directions — a module that gains a network call without
        // being declared fails, and a declared module that stops using the network
        // fails too — which a hand-maintained skip list inside the loop could never
        // do. The prefix assertion below keeps
        // the original intent: every allowlisted module is service code, so the emit
        // path (logger, cache, buffer, writer, render, refs, record, level,
        // normalize, stack, fingerprint, redact, context, decide) can never be on
        // this list, and R18's independence from the service is preserved.
        const sources: Array<{path: string; url: URL}> = [
            {path: 'index.ts', url: new URL('../index.ts', import.meta.url)},
        ];
        for (const dir of ['src', 'bin']) {
            const base = new URL(`../${dir}/`, import.meta.url);
            const names = (await readdir(base, {recursive: true})) as string[];
            for (const name of names) {
                if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
                    sources.push({path: `${dir}/${name}`, url: new URL(name, base)});
                }
            }
        }
        // The enumeration is asserted, not assumed: a scan that silently matched
        // nothing would pass every check below. These are the modules the previous
        // hand-written list could not see, plus one emitter module, so the check
        // that the emit path is scanned cannot disappear behind the service.
        const scanned = sources.map(source => source.path).join('\n');
        t.match(scanned, /^src\/service\/app\.ts$/m, 'the service entry point is scanned');
        t.match(scanned, /^src\/service\/provider\.ts$/m, 'the embedding providers are scanned');
        t.match(
            scanned,
            /^bin\/semantic-log-service\.ts$/m,
            'the service bin entry point is scanned',
        );
        t.match(
            scanned,
            /^src\/logger\.ts$/m,
            'and so is the emit path, which must never be allowed to network',
        );

        // Static, so it fails the moment such a call is written rather than when it
        // happens to be reached. The dynamic half of the proof is the burst above:
        // nothing that blocks can complete a 10k burst promptly.
        const network = /from 'node:(?:net|http|https|dns|tls|dgram|http2)'|\bfetch\s*\(/;
        const online = new Set<string>();
        for (const source of sources) {
            if (network.test(await readFile(source.url, 'utf8'))) {
                online.add(source.path);
            }
        }

        // Data, not an exemption buried in the loop: the equality below is what
        // makes the declaration load-bearing. `start.ts` binds a socket, which is as
        // much a network reach as `app.ts` merely importing `fastify` was — it is the
        // listener for the service's own port, on loopback, and it never joins the
        // emit path.
        const NETWORK_ALLOWLIST = [
            'src/service/provider.ts',
            'src/service/start.ts',
            'src/service/transport.ts',
        ];
        t.ok(
            NETWORK_ALLOWLIST.length > 0,
            'the allowlist is not empty, so the scoping check below is not vacuous',
        );
        for (const allowed of NETWORK_ALLOWLIST) {
            t.match(
                allowed,
                /^src\/service\//,
                `${allowed} is service code, never part of the emit path (R18)`,
            );
        }
        t.same(
            [...online].sort(),
            [...NETWORK_ALLOWLIST].sort(),
            'exactly the declared modules use the network: no undeclared use, and no stale declaration',
        );
    },
);
