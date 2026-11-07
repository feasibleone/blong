/* eslint-disable @typescript-eslint/no-explicit-any -- the knex builder is
   untyped here, as in the rest of the adapter's db group. */
import {library} from '@feasibleone/blong';

type KnexQb = any;

/**
 * `seedReference` — resolve classifier names to the ids a seed writes.
 *
 * A production seed names the classifier a row belongs to (`sport: Boxing`),
 * never its id: the id is minted per database and differs between a developer's
 * copy, CI and a deployment. This library turns the names of one resource type
 * into their `binary(16)` ids, in one statement, and refuses a name that
 * resolves to nothing — a seed that silently wrote a row pointing at no sport
 * would be worse than a failed boot.
 *
 * The ids come back as Buffers, not as the base64 text a browser sends: a seed
 * runs before the adapter has discovered its binary columns
 * (`setBinaryCols` runs after the seed phase), so the generic `merge` cannot
 * convert a string for a `binary(16)` column and MySQL answers
 * `ER_DATA_TOO_LONG`. A Buffer binds as it is.
 *
 * The type alias is the resource type (`sport.sport`, `sport.discipline`), not
 * the table: a classifier's readable name lives in `core_resource` for every
 * kind of row, and a table with its own `resource: {nameColumn}` mirrors it
 * there.
 *
 * Wire: a library function of the `sport.db` handler group, used by
 * `sport.nomenclature.merge` and `sport.register.merge`.
 */
export default library(() => {
    return {
        async seedReference(
            qb: KnexQb,
            typeAlias: string,
            names: string[],
        ): Promise<Record<string, Buffer>> {
            const unique = [...new Set(names.filter(name => typeof name === 'string' && name))];
            if (!unique.length) return {};
            const rows = (await qb('core_resource as r')
                .join('core_type as t', 't.typeId', 'r.typeId')
                .where('t.typeAlias', typeAlias)
                .whereIn('r.resourceName', unique)
                .select('r.resourceName as name', 'r.resourceId as id')) as Array<{
                name: string;
                id: Buffer;
            }>;
            const byName: Record<string, Buffer> = {};
            for (const row of rows) byName[String(row.name)] = Buffer.from(row.id);
            const missing = unique.filter(name => !byName[name]);
            if (missing.length) {
                throw new Error(
                    `seed reference to an unknown ${typeAlias}: ${missing.join(', ')} ` +
                        '(the classifier must be seeded before the rows that name it)',
                );
            }
            return byName;
        },

        /** The id a resolved name stands for; throws when the name is absent. */
        seedRef(byName: Record<string, Buffer>, typeAlias: string, name: string): Buffer {
            const id = byName[name];
            if (!id) {
                throw new Error(`seed references an unknown ${typeAlias}: "${name}"`);
            }
            return id;
        },
    };
});
