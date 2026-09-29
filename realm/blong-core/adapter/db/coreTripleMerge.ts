import {type IMeta, type IPathRefresh, handler} from '@feasibleone/blong';

import {uuidBuf} from './core.ts';

type KnexQb = any;

/**
 * The rebuild the runtime's coordinator drives when there is no coordinator on
 * the context — a schema that declares no rebuild has nothing to keep in sync,
 * so this is only the name the realms already call inline.
 */
const DEFAULT_PATH_REFRESH = 'access_pathRefresh';

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
                /** When true, rebuild the materialized paths after merging edges. */
                refreshPath?: boolean;
            },
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _$meta: IMeta,
        ): Promise<{success: boolean}> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            const pathRefresh = (this.config?.context as {pathRefresh?: IPathRefresh} | undefined)
                ?.pathRefresh;

            // Register before the deferral is acted on: the batch's drain waits for
            // the writers it can see, so a merge that read `deferred` while the
            // batch was open has to be counted while it runs. Registration costs
            // nothing when nothing is deferred.
            const deferred = pathRefresh?.deferred === true;
            const leave = pathRefresh?.enter();
            try {
                // Run the edge writes as ONE atomic unit.
                //
                // `access_pathRefresh()` is a full rebuild: it scans `core_triple`
                // (via access_effectiveActionPath / access_effectiveRolePath) and
                // holds shared locks on the `core_triple` FK indexes while re-writing
                // `core_path`. A concurrent merge inserting a new edge needs an
                // insert-intention X lock on the same index → DB deadlock (errno 1213).
                //
                // The inserts (`onConflict` ignore) and the rebuild are idempotent, so
                // the transaction is safe to re-run after a transient deadlock /
                // lock-wait timeout, which the adapter does for the whole statement.
                //
                // During the seed phase `pathRefresh.deferred` is set, so a merge
                // counts itself in the durable generation instead of rebuilding
                // per merge, and the batch drains once every writer has settled.
                // That avoids both the redundant full rebuilds and the
                // write-vs-rebuild deadlock window without ever losing an edge: a
                // rebuild that read the generation before this transaction
                // committed leaves the count uncovered, so the next rebuild in any
                // process covers it.
                await qb.transaction(async (trx: KnexQb) => {
                    if (params.triples.length) {
                        // One batched statement rather than a round trip per edge:
                        // a seed asset hands over its whole edge list at once, and
                        // `INSERT IGNORE` makes a replayed seed a no-op.
                        await trx('core_triple')
                            .insert(
                                params.triples.map(({subjectId, predicateName, objectId}) => ({
                                    subjectId: uuidBuf(subjectId),
                                    predicateName,
                                    objectId: uuidBuf(objectId),
                                })),
                            )
                            .onConflict()
                            .ignore();
                    }

                    if (params.refreshPath && !deferred) {
                        await trx.raw(`CALL ${pathRefresh?.procedure ?? DEFAULT_PATH_REFRESH}()`);
                    } else {
                        // Either the seed batch owns the rebuild, or the caller
                        // merges edges without one: the durable generation records
                        // that the paths are behind the graph now, so the batch's
                        // drain — or any rebuild in any process — covers this write
                        // rather than losing it.  Counting it in this transaction is
                        // what makes reading the generation enough to know that.
                        await pathRefresh?.bumpGeneration(trx);
                    }
                });
            } finally {
                await leave?.();
            }

            return {success: true};
        },
);
