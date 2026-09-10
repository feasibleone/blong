import {type IMeta, handler} from '@feasibleone/blong';

import {uuidBuf} from './core.ts';

type KnexQb = any;

/**
 * Merge resource-graph edges (`core_triple`) for seeds.
 *
 * Wire: `core.triple.merge` — takes an array of edges as **already-resolved
 * resource ids** (hex UUID strings, e.g. returned by `core.resource.ensure`)
 * and inserts the `core_triple` rows (`onConflict` ignore).  Optionally
 * refreshes the materialized `access_path` when `refreshPath` is set (used by
 * authorization seeds).
 *
 * This replaces the hand-rolled `core_triple` inserts + `access_pathRefresh()`
 * wiring previously duplicated in every seed handler (`gateway.bundle.merge`,
 * `gateway.subscription.merge`, `access.authorization.merge`,
 * `access.account.add`).
 */
export default handler(
    () =>
        async function coreTripleMerge(
            params: {
                triples: Array<{
                    subjectId: string;
                    predicateName: string;
                    objectId: string;
                }>;
                /** When true, `CALL access_pathRefresh()` after merging edges. */
                refreshPath?: boolean;
            },
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _$meta: IMeta,
        ): Promise<{success: boolean}> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            // Run the edge writes (+ `access_pathRefresh` unless deferred) as ONE
            // atomic unit.
            //
            // `access_pathRefresh()` is a full rebuild: it scans `core_triple`
            // (via access_effectiveActionPath / access_effectiveRolePath) and
            // holds shared locks on the `core_triple` FK indexes while re-writing
            // `core_path`. A concurrent merge inserting a new edge needs an
            // insert-intention X lock on the same index → DB deadlock (errno 1213).
            //
            // Both the edge inserts (`onConflict` ignore) and the refresh are
            // idempotent, so the transaction is safe to re-run after a transient
            // deadlock / lock-wait timeout.  Retrying transient deadlocks is
            // planned to be handled generically by the adapter as an opt-in
            // mechanism — until that lands, the refresh is fast enough that
            // explicit per-handler retries here are not needed.
            //
            // During the seed phase the adapter sets `context.deferPathRefresh`,
            // so merges skip the per-merge rebuild and the seed phase runs one
            // single `access_pathRefresh()` at the end — avoids both redundant
            // full rebuilds and the write-vs-refresh deadlock window.
            const deferRefresh =
                (this.config?.context as {deferPathRefresh?: boolean} | undefined)
                    ?.deferPathRefresh === true;

            await qb.transaction(async (trx: KnexQb) => {
                for (const {subjectId, predicateName, objectId} of params.triples) {
                    await trx('core_triple')
                        .insert({
                            subjectId: uuidBuf(subjectId),
                            predicateName,
                            objectId: uuidBuf(objectId),
                        })
                        .onConflict()
                        .ignore();
                }

                if (params.refreshPath && !deferRefresh) {
                    await trx.raw('CALL access_pathRefresh()');
                }
            });

            return {success: true};
        },
);
