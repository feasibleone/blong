/**
 * Relation discovery and cascade deletion for the knex adapter.
 *
 * A delete has two questions to answer that the schema alone does not: what still
 * refers to this record (so the caller can be told, in its own vocabulary, what a
 * delete would take with it), and in which order the referring rows must go (so a
 * cascade does not trip over the very constraints it is meant to satisfy).
 *
 * Both are read from INFORMATION_SCHEMA once per connection — the same source the
 * binary and date column maps come from — rather than declared per realm: the
 * constraints are the truth, and a realm that adds a table without touching this
 * module still gets a correct answer.
 *
 * @@F-697 records the failure that led here; the deletion modes a model chooses
 * between are described in @@D-784.
 */
import {type Knex} from '@feasibleone/blong';

/** One foreign key: `table.column` → `referencedTable.referencedColumn`. */
export interface IRelation {
    table: string;
    column: string;
    referencedTable: string;
    referencedColumn: string;
}

export interface IRelationIndex {
    /** Referenced table → the foreign keys pointing at it. */
    incoming: Map<string, IRelation[]>;
    /** Table → the foreign keys it carries, which name the tables it extends. */
    outgoing: Map<string, IRelation[]>;
    /** Table → its primary key, when it has exactly one column. */
    primary: Map<string, string>;
}

/**
 * Tables the framework maintains: they describe a record rather than depend on it
 * (a translation of its name is not a conferral), so they never appear in a count.
 */
const HIDDEN_TABLES = new Set([
    'core_triple',
    'core_path',
    'core_property',
    'core_translation',
    'core_label',
]);

/**
 * Of those, the ones the remove path itself maintains — graph edges and the
 * flattened paths rebuilt from them. A cascade leaves them to that path, because
 * deleting an edge out of order is how the path table is left inconsistent.
 */
const UNMANAGED_TABLES = new Set(['core_triple', 'core_path']);

/** How deep a cascade follows the foreign keys before it stops. */
const MAX_CASCADE_DEPTH = 12;

/** Discover the foreign keys and primary keys of the adapter's own database. */
export async function discoverRelations(knex: Knex): Promise<IRelationIndex> {
    const foreignRows: Array<{
        tableName: string;
        columnName: string;
        referencedTableName: string;
        referencedColumnName: string;
    }> = await knex
        .from('INFORMATION_SCHEMA.KEY_COLUMN_USAGE')
        .whereRaw('TABLE_SCHEMA = DATABASE()')
        .whereNotNull('REFERENCED_TABLE_NAME')
        .select({
            tableName: 'TABLE_NAME',
            columnName: 'COLUMN_NAME',
            referencedTableName: 'REFERENCED_TABLE_NAME',
            referencedColumnName: 'REFERENCED_COLUMN_NAME',
        });
    const incoming = new Map<string, IRelation[]>();
    const outgoing = new Map<string, IRelation[]>();
    for (const row of foreignRows) {
        const relation: IRelation = {
            table: row.tableName,
            column: row.columnName,
            referencedTable: row.referencedTableName,
            referencedColumn: row.referencedColumnName,
        };
        const inbound = incoming.get(relation.referencedTable) ?? [];
        inbound.push(relation);
        incoming.set(relation.referencedTable, inbound);
        const outbound = outgoing.get(relation.table) ?? [];
        outbound.push(relation);
        outgoing.set(relation.table, outbound);
    }

    const primaryRows: Array<{tableName: string; columnName: string}> = await knex
        .from('INFORMATION_SCHEMA.KEY_COLUMN_USAGE')
        .whereRaw('TABLE_SCHEMA = DATABASE()')
        .where('CONSTRAINT_NAME', 'PRIMARY')
        .select({tableName: 'TABLE_NAME', columnName: 'COLUMN_NAME'});
    const byTable = new Map<string, string[]>();
    for (const row of primaryRows) {
        const list = byTable.get(row.tableName) ?? [];
        list.push(row.columnName);
        byTable.set(row.tableName, list);
    }
    const primary = new Map<string, string>();
    for (const [table, columns] of byTable) {
        // A composite key is skipped: its rows are deleted, never walked into.
        if (columns.length === 1) primary.set(table, columns[0]);
    }

    return {incoming, outgoing, primary};
}

/** One table that still holds rows referring to the record. */
export interface IDependant {
    /** The table that holds the rows — `sport_conferral`. */
    table: string;
    /** The column that carries the reference — `recipientResourceId`. */
    column: string;
    /** How many rows that column ties to the record. */
    count: number;
}

export interface IRecordRef {
    table: string;
    /** The primary key column of `table` (`athleteId`). */
    key: string;
    /** The key value, as the wire sent it or as a Buffer. */
    value: unknown;
    /**
     * The `core_resource` row the record is backed by, when it is backed by one.
     * A profile's own table has the resource as its PK; a resource-backed
     * classifier's PK *is* the resource id.
     */
    resourceId?: unknown;
}

/** The foreign keys that point at `table` (optionally at one of its columns). */
export function relationsTo(index: IRelationIndex, table: string, column?: string): IRelation[] {
    const list = index.incoming.get(table) ?? [];
    return column === undefined
        ? list
        : list.filter(relation => relation.referencedColumn === column);
}

/**
 * Count the rows still referring to the record, one entry per referencing table
 * and column. Framework tables are left out: the delete path maintains the graph
 * itself, and counting it would report a dependency no operator can act on.
 */
export async function countDependants(
    qb: Knex,
    index: IRelationIndex,
    record: IRecordRef,
): Promise<IDependant[]> {
    // The tables the record's own row extends (`sport_athlete` → `party_person`):
    // those rows are the record's identity, not something a delete takes with it, so
    // an athlete delete does not read as though it were losing a person as well.
    const parents = new Set(
        (index.outgoing.get(record.table) ?? []).map(relation => relation.referencedTable),
    );
    const roots: Array<{table: string; column: string; value: unknown}> = [
        {table: record.table, column: record.key, value: record.value},
    ];
    if (record.resourceId !== undefined && record.resourceId !== null) {
        roots.push({table: 'core_resource', column: 'resourceId', value: record.resourceId});
    }

    const counts: IDependant[] = [];
    for (const root of roots) {
        for (const relation of relationsTo(index, root.table, root.column)) {
            if (HIDDEN_TABLES.has(relation.table)) continue;
            if (parents.has(relation.table)) continue;
            // A resource-backed table holds its own key: the row being deleted is not
            // one of the records the delete takes with it.
            if (relation.table === record.table && relation.column === record.key) continue;
            const row = await qb(relation.table)
                .where(relation.column, root.value as never)
                .count({count: '*'})
                .first();
            const count = Number((row as {count?: number | string} | undefined)?.count ?? 0);
            if (count > 0) counts.push({table: relation.table, column: relation.column, count});
        }
    }
    // A record can be referenced through two columns of one table (a participation
    // sits between an athlete and an edition); the operator reads one line per table.
    const merged = new Map<string, IDependant>();
    for (const entry of counts) {
        const existing = merged.get(entry.table);
        if (existing) existing.count += entry.count;
        else merged.set(entry.table, {...entry});
    }
    return [...merged.values()].sort((a, b) => a.table.localeCompare(b.table));
}

/** Rows deleted by a cascade, per table. */
export type CascadeReport = Record<string, number>;

/** How many rows the cascade removed, per table, and what it left unreachable. */
export interface ICascadeResult {
    /** Rows deleted, per table. */
    removed: CascadeReport;
    /**
     * `core_resource` ids of cascaded children that were themselves resource-backed.
     * The caller deletes them after the path refresh, because `core_path` holds a
     * foreign key to `core_resource` (`@@F-697`).
     */
    resources: unknown[];
}

/** Whether `table.key` is the reference that makes the table resource-backed. */
export function isResourceKey(index: IRelationIndex, table: string, column: string): boolean {
    return relationsTo(index, 'core_resource', 'resourceId').some(
        relation => relation.table === table && relation.column === column,
    );
}

/**
 * Delete every row that refers to the given roots, deepest first.
 *
 * The walk follows the foreign keys from the record outwards: for each table that
 * points at the current one, the referencing rows' own keys are collected first,
 * their dependants deleted, and only then the rows themselves — so a constraint is
 * never violated on the way down. A table reached twice is walked once (a
 * `previousResultId` self-reference is skipped rather than followed in a circle).
 */
export async function cascadeDelete(
    qb: Knex,
    index: IRelationIndex,
    roots: Array<{table: string; column: string; value: unknown}>,
    result: ICascadeResult = {removed: {}, resources: []},
    path = new Set<string>(),
    depth = 0,
): Promise<ICascadeResult> {
    // A schema can describe a cycle that no row closes; the guard is depth, not a
    // global visited set, because two rows of one table have different dependants
    // and a shared set would skip the second one's.
    if (depth > MAX_CASCADE_DEPTH) return result;
    for (const root of roots) {
        for (const relation of relationsTo(index, root.table, root.column)) {
            if (UNMANAGED_TABLES.has(relation.table)) continue;
            // A self-reference is satisfied by the delete of the rows themselves.
            if (relation.table === relation.referencedTable) continue;
            const mark = `${relation.table}.${relation.column}`;
            if (path.has(mark)) continue;
            const childPath = new Set(path).add(mark);
            const childKey = index.primary.get(relation.table);
            let childIds: unknown[] = [];

            if (childKey) {
                childIds = (
                    (await qb(relation.table)
                        .where(relation.column, root.value as never)
                        .select(childKey)) as Array<Record<string, unknown>>
                ).map(row => row[childKey]);
                if (childIds.length) {
                    // The children's own dependants first, one root per key value.
                    await cascadeDelete(
                        qb,
                        index,
                        childIds.map(value => ({
                            table: relation.table,
                            column: childKey,
                            value,
                        })),
                        result,
                        childPath,
                        depth + 1,
                    );
                }
            }
            const removed = await qb(relation.table)
                .where(relation.column, root.value as never)
                .del();
            result.removed[relation.table] =
                (result.removed[relation.table] ?? 0) + Number(removed ?? 0);
            // A cascaded row that was itself resource-backed leaves its resource
            // behind, which is the orphan T-613 describes one level up.
            if (childKey && childIds.length && isResourceKey(index, relation.table, childKey)) {
                result.resources.push(...childIds);
            }
        }
    }
    return result;
}
