import {type IMeta, handler} from '@feasibleone/blong';

import {bufToUuid, ensureType, newUuid, nextCounter, uuidBuf} from './core.ts';

type KnexQb = any;

/**
 * Ensure a `core_resource` + entity-table row exist for a named entity.
 *
 * Looks up an existing `core_resource` by `typeAlias` + `resourceName` and
 * returns its `resourceId` (hex UUID string) when present.  Otherwise it
 * creates the `core_type`, the `core_resource`, and the entity-table row
 * (`table`, keyed by `keyName`, with `extraColumns`) and returns the new id.
 * When the resource already exists the entity row is left untouched
 * (preserving e.g. a pre-seeded roleBit).
 *
 * `table` (and its `keyName` / `extraColumns`) may be omitted to ensure a
 * **bare graph node** — a resource that exists only to be pointed at, such as a
 * wildcard/sentinel target.
 *
 * Two behaviours the callers rely on:
 *
 * - **The entity row is verified.**  The entity insert is `INSERT IGNORE` (see
 *   the comment in the body), which on MySQL ignores a duplicate on *any* unique
 *   key — so the row is read back afterwards and a missing one raises an error.
 *   Returning an id whose entity row does not exist is what produced "ghost"
 *   resources (T-102): the name is taken, the entity can never be created under
 *   it again, and every later lookup silently finds nothing.
 * - **A unique counter column can be allocated** (`allocate`), which is how a
 *   caller that has no opinion about the value — a `roleBit`, say — stops
 *   hardcoding one.
 *
 * An existing resource whose entity row is missing is **healed**: the row is
 * inserted for the resource that is already there, so a ghost left over from an
 * earlier failure stops being permanent.
 *
 * Wire: `core.resource.ensure` — shared resource-graph helper in the
 * `core.db` handler group, imported by the `srv.db` knex adapter.
 */
export default handler(
    () =>
        async function coreResourceEnsure(
            params: {
                name: string;
                typeAlias: string;
                /** Entity table for the resource row; omit for a bare node. */
                table?: string;
                extraColumns?: Record<string, unknown>;
                keyName?: string;
                /**
                 * Allocate a value for a UNIQUE counter column the caller left
                 * blank (`{column: 'roleBit', max: 1023}`): the first free value
                 * is taken, monotonically and never reused (see `nextCounter`).
                 */
                allocate?: {column: string; max: number};
            },
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _$meta: IMeta,
        ): Promise<{resourceId: string}> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            const byName = async (): Promise<string | undefined> => {
                const row = await qb
                    .select('core_resource.resourceId')
                    .from('core_resource')
                    .join('core_type', 'core_resource.typeId', 'core_type.typeId')
                    .where('core_type.typeAlias', params.typeAlias)
                    .where('core_resource.resourceName', params.name)
                    .first();
                return row ? bufToUuid(row.resourceId) : undefined;
            };

            let resourceId = await byName();
            if (!resourceId) {
                const typeId = await ensureType(qb, params.typeAlias);
                const candidate = newUuid();
                await qb('core_resource')
                    .insert({resourceId: uuidBuf(candidate), resourceName: params.name, typeId})
                    .onConflict()
                    .ignore();
                // A concurrent create may have won the race: the insert was
                // ignored, so the stored id — not ours — keys the entity row.
                resourceId = (await byName()) ?? candidate;
            }
            if (!params.table || !params.keyName) return {resourceId};

            const table: string = params.table;
            const keyName: string = params.keyName;
            const entityKey = uuidBuf(resourceId);
            const rowExists = async (): Promise<boolean> =>
                Boolean(await qb(table).where(keyName, entityKey).first(keyName));
            const allocate = params.allocate;
            const supplied = allocate ? params.extraColumns?.[allocate.column] : undefined;
            // An empty form field arrives as '' — treat it like "not supplied".
            const explicit =
                supplied === undefined || supplied === null || supplied === ''
                    ? undefined
                    : supplied;
            // Only an allocated value may be retried; an explicit one is the
            // caller's own answer and belongs to them.
            const attempts = allocate && explicit === undefined ? 3 : 1;
            for (let attempt = 0; attempt < attempts; attempt++) {
                const extra: Record<string, unknown> = {...(params.extraColumns ?? {})};
                if (allocate && explicit === undefined) {
                    extra[allocate.column] = await nextCounter(
                        qb,
                        table,
                        allocate.column,
                        allocate.max,
                    );
                }
                // `INSERT IGNORE` (not `ON DUPLICATE KEY UPDATE`): the keyName is
                // a fresh UUID so it never conflicts here, while `merge()` would
                // also fire on ANY other unique key — e.g. `access_role.roleBit` —
                // and silently OVERWRITE an existing row (destroying the role).
                // Ignore keeps the insert insert-only; the row is then verified
                // below, because ignoring a conflict is exactly how a row went
                // missing without a trace.
                await qb(table)
                    .insert({[keyName]: entityKey, ...extra})
                    .onConflict(keyName)
                    .ignore();
                if (await rowExists()) return {resourceId};
            }
            throw new Error(
                `Could not create the ${table} row for "${params.name}"` +
                    (allocate
                        ? `: every ${allocate.column} tried (${attempts}) is already taken`
                        : ': a unique column is already taken'),
            );
        },
);
