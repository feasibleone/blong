/**
 * The rebuild follows the last write, across processes (T-174).
 *
 * `access_pathRefresh()` is a full rebuild of the materialized paths from
 * `core_triple`, and the seed phase writes every one of its edges with the rebuild
 * deferred so it can run once instead of once per merge. "Once" is where it went
 * wrong: a merge that entered the batch could commit after the batch rebuilt, and
 * its edge then stayed out of the paths until the next start — the caller was left
 * without an action it had been granted, which is exactly how the framework
 * realm's digest page was refused `blong.flow.find`.
 *
 * What closes it has to work between processes, so it cannot be a flag and it
 * cannot be this object's memory: the generation counts the writes that skipped
 * their rebuild, a rebuild publishes the generation it read at its start, and the
 * *difference* — covered trailing the generation — is what owes another rebuild.
 * The properties asserted here are the ones a production topology needs:
 *
 * - a writer this process can see holds the drain open, so a rebuild cannot
 *   overtake it;
 * - a write that commits *while* a rebuild runs counts itself after that rebuild
 *   read the generation, so it stays uncovered and the next rebuild covers it —
 *   the case a dirty flag loses, because a flag is cleared by the rebuild that
 *   never saw the write;
 * - two coordinators over one database — two processes — converge, and neither has
 *   to be the one that noticed.
 */
import t from 'tap';

import {createPathRefresh} from './pathRefresh.ts';

const GENERATION = 'access_pathRefresh.generation';
const COVERED = 'access_pathRefresh.covered';

/**
 * A stand-in for the database: a `core_counter` table behind
 * `qb(...)`/`insert`/`onConflict`/`merge`/`select`, and a `raw` that behaves like
 * the procedure — read the generation, rebuild, publish what was read.
 */
function fakeDb() {
    const counters = new Map<string, number>();
    const rebuilds: string[] = [];
    let during: (() => unknown) | undefined;

    const qb = ((table: string) => {
        if (table !== 'core_counter') throw new Error(`unexpected table: ${table}`);
        return {
            select: () => ({
                // The coordinator asks for both counters in one round trip.
                whereIn: (_column: string, names: string[]) => ({
                    then: (
                        resolve: (
                            rows: Array<{counterName: string; counterValue: number}>,
                        ) => unknown,
                    ) =>
                        resolve(
                            names
                                .filter(name => counters.has(name))
                                .map(name => ({
                                    counterName: name,
                                    counterValue: counters.get(name)!,
                                })),
                        ),
                }),
            }),
            insert: (row: {counterName: string; counterValue: number}) => ({
                onConflict: () => ({
                    merge: async (update: {counterValue: unknown}) => {
                        const current = counters.get(row.counterName) ?? 0;
                        // `nextCounter` merges a `GREATEST(...)` high-water mark,
                        // the generation merges an increment; the stand-in only
                        // has to tell those two apart, and both arrive as the raw
                        // fragment `qb.raw` returns below.
                        const fragment = String(update?.counterValue ?? '');
                        counters.set(
                            row.counterName,
                            fragment.includes('+ 1') ? current + 1 : current,
                        );
                    },
                }),
            }),
        };
    }) as unknown as {
        // `raw` answers a fragment for a value and a promise for a call, exactly
        // as knex does — hence `unknown`, not a promise.
        raw: (sql: string) => unknown;
        transaction: <T>(fn: (trx: unknown) => Promise<T>) => Promise<T>;
    };

    qb.raw = (sql: string) => {
        // Knex's `raw` builds a fragment (and is not async); a procedure call is
        // what rebuilds.
        if (!sql.startsWith('CALL')) {
            return Object.assign({sql}, {toString: () => sql});
        }
        return (async () => {
            rebuilds.push(sql);
            const generation = counters.get(GENERATION) ?? 0;
            // A writer that commits while the rebuild runs: it lands after the read
            // above, which is what makes it uncovered.
            const pending = during;
            during = undefined;
            await pending?.();
            counters.set(COVERED, Math.max(counters.get(COVERED) ?? 0, generation));
            return [];
        })();
    };
    qb.transaction = async <T>(fn: (trx: unknown) => Promise<T>) => fn(qb);

    return {
        qb,
        counters,
        rebuilds,
        /** Run `fn` while the next rebuild is running, to model a racing writer. */
        duringRebuild: (fn: () => unknown) => {
            during = fn;
        },
    };
}

t.test('a writer still in flight holds the drain open, and is covered before it ends', async t => {
    const db = fakeDb();
    const pathRefresh = createPathRefresh();
    let settle: (() => Promise<void>) | undefined;

    await pathRefresh.defer(db.qb, async () => {
        t.equal(pathRefresh.deferred, true, 'the deferral is open inside the batch');
        const leave = pathRefresh.enter();
        await pathRefresh.bumpGeneration(db.qb);
        // Commit after the batch's work but before the drain's first check: the
        // late commit the old "run it at the end" missed.
        setTimeout(() => void leave(), 0);
        settle = leave;
    });

    await settle?.();
    t.equal(pathRefresh.deferred, false, 'the deferral is closed after the batch');
    t.equal(db.rebuilds.length, 1, 'the batch rebuilt once, after the writer settled');
    t.equal(db.counters.get(COVERED), 1, 'and published the generation the writer counted');
    t.equal(await pathRefresh.uncovered(db.qb), false, 'so nothing is owed');
    t.end();
});

t.test('a write that commits while a rebuild runs is covered by the next rebuild', async t => {
    const db = fakeDb();
    const pathRefresh = createPathRefresh();
    db.counters.set(GENERATION, 1);

    db.duringRebuild(() => pathRefresh.bumpGeneration(db.qb));

    await pathRefresh.defer(db.qb, async () => {});

    t.equal(db.counters.get(GENERATION), 2, 'the racing write was counted');
    t.equal(
        db.rebuilds.length,
        2,
        'the drain rebuilt again rather than returning with the write uncovered',
    );
    t.equal(db.counters.get(COVERED), 2, 'and the second rebuild covered it');
    t.equal(await pathRefresh.uncovered(db.qb), false, 'nothing is owed');
    t.end();
});

t.test('two processes over one database converge, whoever notices', async t => {
    const db = fakeDb();
    const seeding = createPathRefresh();
    const serving = createPathRefresh();
    db.counters.set(GENERATION, 1);

    // The serving process is not deferring, and its merge commits while the seeder
    // is inside its rebuild: the seeder has already read the generation, so the
    // serving write is uncovered and the seeder has to rebuild once more.
    db.duringRebuild(() => serving.bumpGeneration(db.qb));

    await seeding.defer(db.qb, async () => {});

    t.equal(db.counters.get(GENERATION), 2, 'the serving write was counted');
    t.equal(db.rebuilds.length, 2, 'the seeder rebuilt a second time');
    t.equal(db.counters.get(COVERED), 2, 'and covered a write it never saw');
    t.equal(await serving.uncovered(db.qb), false, 'the serving process agrees nothing is owed');
    t.end();
});

t.test('a nested deferral drains once, at the outermost scope', async t => {
    const db = fakeDb();
    const pathRefresh = createPathRefresh();
    db.counters.set(GENERATION, 1);

    await pathRefresh.defer(db.qb, async () => {
        await pathRefresh.defer(db.qb, async () => {});
        t.equal(pathRefresh.deferred, true, 'the inner scope does not end the deferral');
        t.equal(db.rebuilds.length, 0, 'nor does it rebuild while the outer one is open');
    });

    t.equal(pathRefresh.deferred, false, 'the outermost scope ends the deferral');
    t.equal(db.rebuilds.length, 1, 'and drains once');
    t.end();
});

t.test('a batch that counted nothing rebuilds nothing', async t => {
    const db = fakeDb();
    const pathRefresh = createPathRefresh();

    await pathRefresh.defer(db.qb, async () => {});

    t.equal(db.rebuilds.length, 0, 'an empty batch has nothing to rebuild for');
    t.equal(await pathRefresh.uncovered(db.qb), false, 'and owes nothing');
    t.end();
});
