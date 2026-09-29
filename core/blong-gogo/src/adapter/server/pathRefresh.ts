import {type IPathRefresh, type Knex} from '@feasibleone/blong/types';

type KnexQb = Knex;

/**
 * The coordinator the runtime hands to edge writers through the adapter context.
 * The contract and the reasoning behind it live with the type, in
 * `core/blong/types.ts`; this module is the implementation the database adapter
 * creates (see `knex.ts`) and `core.triple.merge` drives.
 */
export type {IPathRefresh};

/**
 * Create the coordinator for one connection's rebuild procedure.
 *
 * `procedure` defaults to `access_pathRefresh()`, the procedure the access realm
 * declares and the one the runtime already called inline.
 */
export function createPathRefresh(procedure = 'access_pathRefresh'): IPathRefresh {
    const generationKey = `${procedure}.generation`;
    const coveredKey = `${procedure}.covered`;
    const waiters: Array<() => void> = [];
    let inFlight = 0;
    let deferred = false;

    const idle = (): Promise<void> =>
        inFlight === 0
            ? Promise.resolve()
            : new Promise<void>(resolve => {
                  waiters.push(resolve);
              });

    const counter = (qb: unknown, name: string): number => {
        const row = (qb as Array<{counterName: string; counterValue: number | string}>).find(
            entry => entry.counterName === name,
        );
        return Number(row?.counterValue ?? 0);
    };

    /**
     * Whether the paths may be behind the graph: an edge was written without a
     * rebuild and no rebuild has covered it since. Both counters come back in one
     * round trip, and neither is this process's memory — that is the point.
     */
    const uncovered = async (qb: unknown): Promise<boolean> => {
        const rows = (await (qb as KnexQb)('core_counter')
            .select('counterName', 'counterValue')
            .whereIn('counterName', [generationKey, coveredKey])) as Array<{
            counterName: string;
            counterValue: number | string;
        }>;
        return counter(rows, generationKey) > counter(rows, coveredKey);
    };

    /**
     * Count a write that skipped its rebuild.
     *
     * Called with the writer's transaction, so the count and the edges it stands
     * for become visible together: a rebuild that reads the generation has seen
     * every edge counted into it, and one that reads it before this commit leaves
     * the write uncovered rather than dropping it.
     */
    const bumpGeneration = async (qb: unknown): Promise<void> => {
        await (qb as KnexQb)('core_counter')
            .insert({counterName: generationKey, counterValue: 1})
            .onConflict('counterName')
            .merge({counterValue: (qb as KnexQb).raw('counterValue + 1')});
    };

    const refresh = async (qb: unknown): Promise<void> => {
        // The procedure locks the row it publishes coverage to, so two rebuilds
        // cannot interleave their DELETE and INSERT over `core_path` — but only
        // inside a transaction: without one each of its statements commits on its
        // own, and the coverage could outlive a rebuild that half failed. A writer
        // that rebuilds inline passes its own transaction instead.
        await (qb as KnexQb).transaction(async (trx: KnexQb) => {
            await trx.raw(`CALL ${procedure}()`);
        });
    };

    const enter = (): (() => Promise<void>) => {
        inFlight += 1;
        let settled = false;
        return async () => {
            if (settled) return;
            settled = true;
            inFlight -= 1;
            if (inFlight === 0) {
                for (const wake of waiters.splice(0)) wake();
            }
        };
    };

    const drain = async (qb: unknown): Promise<void> => {
        for (;;) {
            // Wait for this process's writers before deciding: a rebuild that ran
            // while one was mid-transaction would leave the counter comparison true
            // and cost another rebuild, and waiting turns that into none.
            await idle();
            if (!(await uncovered(qb))) return;
            await refresh(qb);
        }
    };

    const defer = async <T>(qb: unknown, work: () => Promise<T>): Promise<T> => {
        const outer = deferred;
        if (!outer) deferred = true;
        try {
            return await work();
        } finally {
            if (!outer) {
                deferred = false;
                await drain(qb);
            }
        }
    };

    return {
        procedure,
        generationKey,
        coveredKey,
        get deferred() {
            return deferred;
        },
        uncovered,
        enter,
        bumpGeneration,
        refresh,
        drain,
        defer,
    };
}
