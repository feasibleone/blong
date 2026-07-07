import {handler, type IAssert} from '@feasibleone/blong';

import {mergedUnit, units, updatedUnit} from '../fixtures/unit.ts';

type UnitRow = {unitId?: number; unitName?: string; unitDescription?: string};
type AddResult = {unit: {unitId: number}};
type StepMeta = {$meta: Record<string, unknown>};

/**
 * testMysqlCrud — integration test covering all knex adapter CRUD operations:
 * add, get, find, edit, remove, merge, insert, delete.
 *
 * Steps run in a sequential dependency chain to avoid conflicts on shared rows.
 * Fixture data from `fixtures/unit.ts` is used for all inserts.
 */
export default handler(
    ({
        lib: {group, checkpoint},
        handler: {
            sqlUnitCreate,
            sqlUnitDrop,
            sqlUnitAdd,
            sqlUnitGet,
            sqlUnitFind,
            sqlUnitEdit,
            sqlUnitRemove,
            sqlUnitMerge,
            sqlUnitInsert,
            sqlUnitDelete,
        },
    }) => ({
        testMysqlCrud: ({name = 'mysql CRUD'}: {name?: string}) =>
            // chain-level mask: `unitId` for single rows, `*.unitId` for array results
            group(name, {mask: ['unitId', '*.unitId']})([
                // ── 0. Drop the test table (cleanup) ─────────────────────
                async function dropTable(assert: IAssert, {$meta}: StepMeta) {
                    const result = await sqlUnitDrop({}, $meta);
                    assert.ok(result, 'Table drop returned a result');
                    return result as {table: string; dropped: boolean};
                },
                // ── 1. Ensure the test table exists ───────────────────────
                async function createTable(
                    assert: IAssert,
                    {$meta, dropTable}: StepMeta & {dropTable: Promise<unknown>},
                ) {
                    await dropTable;
                    const result = await sqlUnitCreate({}, $meta);
                    assert.ok(result, 'Table create/verify returned a result');
                    return result as {table: string; existed: boolean};
                },

                // ── 2. Wipe any data from previous runs ───────────────────
                async function cleanData(
                    assert: IAssert,
                    {$meta, createTable}: StepMeta & {createTable: Promise<unknown>},
                ) {
                    await createTable;
                    await sqlUnitDelete({}, $meta);
                    return {cleaned: true};
                },

                // ── 3. add — insert a single row ──────────────────────────
                async function addUnit(
                    assert: IAssert,
                    {$meta, cleanData}: StepMeta & {cleanData: Promise<unknown>},
                ) {
                    await cleanData;
                    const result = await sqlUnitAdd({unit: {...units[0]}}, $meta);
                    assert.ok(result, 'add returned a result');
                    assert.ok((result as AddResult).unit.unitId, 'add returned an unitId');
                    return result as AddResult;
                },

                // ── 4. get — fetch the inserted row by primary key ────────
                async function getUnit(
                    assert: IAssert,
                    {$meta, addUnit}: StepMeta & {addUnit: Promise<AddResult>},
                ) {
                    // Snapshot captures unitName and unitDescription; chain-level mask handles unitId.
                    assert.snapshot();
                    return (await sqlUnitGet(
                        {unitId: (await addUnit).unit.unitId},
                        $meta,
                    )) as UnitRow & {unitId: number};
                },

                // ── 5. find — query rows with a filter ───────────────────
                async function findUnits(
                    assert: IAssert,
                    {$meta, addUnit}: StepMeta & {addUnit: Promise<AddResult>},
                ) {
                    await addUnit;
                    // Sort by unitName for snapshot stability; chain-level mask handles unitId.
                    assert.snapshot();
                    return ((await sqlUnitFind({unitName: units[0].unitName}, $meta)) as UnitRow[])
                        .slice()
                        .sort((a, b) => (a.unitName ?? '').localeCompare(b.unitName ?? ''));
                },

                // ── 6. edit — update a row by primary key ─────────────────
                async function editUnit(
                    assert: IAssert,
                    {
                        $meta,
                        getUnit,
                    }: StepMeta & {getUnit: Promise<{unit: UnitRow & {unitId: number}}>},
                ) {
                    const {
                        unit: {unitId},
                    } = await getUnit;
                    const result = await sqlUnitEdit({unit: {unitId, ...updatedUnit}}, $meta);
                    assert.ok(result !== undefined, 'edit returned a result');
                    return {unitId};
                },

                // ── 7. verify edit — re-fetch to confirm the update ───────
                async function verifyEdit(
                    assert: IAssert,
                    {$meta, editUnit}: StepMeta & {editUnit: Promise<{unitId: number}>},
                ) {
                    // Snapshot captures updated unitName and unitDescription.
                    assert.snapshot();
                    return (await sqlUnitGet({unitId: (await editUnit).unitId}, $meta)) as UnitRow;
                },

                // Phase checkpoint: snapshot both read-back results together
                checkpoint('crud-reads', 'getUnit', 'verifyEdit'),

                // ── 8. remove — delete the row by primary key ─────────────
                async function removeUnit(
                    assert: IAssert,
                    {
                        $meta,
                        verifyEdit,
                        editUnit,
                    }: StepMeta & {
                        verifyEdit: Promise<UnitRow>;
                        editUnit: Promise<{unitId: number}>;
                    },
                ) {
                    await verifyEdit;
                    const {unitId} = await editUnit;
                    const result = await sqlUnitRemove({unitId}, $meta);
                    assert.ok(result !== undefined, 'remove returned a result');
                    return {unitId, removed: true};
                },

                // ── 9. merge — upsert a new row ───────────────────────────
                async function mergeUnit(
                    assert: IAssert,
                    {$meta, removeUnit}: StepMeta & {removeUnit: Promise<unknown>},
                ) {
                    await removeUnit;
                    const result = await sqlUnitMerge({unit: [{...mergedUnit}]}, $meta);
                    assert.ok(result !== undefined, 'merge returned a result');
                    return {merged: true};
                },

                // ── 10. insert — bulk insert multiple rows ────────────────
                async function insertUnits(
                    assert: IAssert,
                    {$meta, mergeUnit}: StepMeta & {mergeUnit: Promise<unknown>},
                ) {
                    await mergeUnit;
                    const result = await sqlUnitInsert(
                        units.map(i => ({...i})),
                        $meta,
                    );
                    assert.ok(result !== undefined, 'insert returned a result');
                    return {inserted: true};
                },

                // ── 11. verify bulk insert ────────────────────────────────
                async function verifyInsert(
                    assert: IAssert,
                    {$meta, insertUnits}: StepMeta & {insertUnits: Promise<unknown>},
                ) {
                    await insertUnits;
                    const result = await sqlUnitFind({}, $meta);
                    assert.ok(Array.isArray(result), 'find after bulk insert returned an array');
                    assert.ok(
                        (result as UnitRow[]).length >= units.length,
                        'at least as many rows as inserted fixtures',
                    );
                    return {rowCount: (result as UnitRow[]).length};
                },

                // ── 12. find with limit and order ─────────────────────────
                async function findWithOptions(
                    assert: IAssert,
                    {$meta, verifyInsert}: StepMeta & {verifyInsert: Promise<unknown>},
                ) {
                    await verifyInsert;
                    const result = await sqlUnitFind({limit: 2, order: 'unitName'}, $meta);
                    // Already ordered by unitName via query; snapshot is stable.
                    assert.snapshot();
                    // Keep limit business-invariant: snapshot verifies count implicitly,
                    // but the explicit check documents the intent.
                    assert.ok(
                        (result as UnitRow[]).length <= 2,
                        'find respects the limit parameter',
                    );
                    return result as UnitRow[];
                },

                // ── 13. delete — bulk delete matching rows ────────────────
                async function deleteUnits(
                    assert: IAssert,
                    {$meta, findWithOptions}: StepMeta & {findWithOptions: Promise<unknown>},
                ) {
                    await findWithOptions;
                    const result = await sqlUnitDelete({unitName: units[0].unitName}, $meta);
                    assert.ok(result !== undefined, 'delete returned a result');
                    return {deleted: true};
                },
            ]),
    }),
);
