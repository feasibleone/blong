import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

import {items, mergedItem, updatedItem} from '../fixtures/item.ts';

type ItemRow = {itemId?: number; itemName?: string; itemDescription?: string};
type AddResult = {itemId: number};
type StepMeta = {$meta: Record<string, unknown>};

/**
 * testMysqlCrud — integration test covering all knex adapter CRUD operations:
 * add, get, find, edit, remove, merge, insert, delete.
 *
 * Steps run in a sequential dependency chain to avoid conflicts on shared rows.
 * Fixture data from `fixtures/item.ts` is used for all inserts.
 */
export default handler(
    ({
        lib: {group},
        handler: {
            sqlTableCreate,
            sqlTableDrop,
            sqlItemAdd,
            sqlItemGet,
            sqlItemFind,
            sqlItemEdit,
            sqlItemRemove,
            sqlItemMerge,
            sqlItemInsert,
            sqlItemDelete,
        },
    }) => ({
        testMysqlCrud: ({name = 'mysql CRUD'}: {name?: string}) =>
            group(name)([
                // ── 1. Ensure the test table exists ───────────────────────
                async function createTable(assert: typeof Assert, {$meta}: StepMeta) {
                    const result = await sqlTableCreate({}, $meta);
                    assert.ok(result, 'Table create/verify returned a result');
                    return result as {table: string; existed: boolean};
                },

                // ── 2. Wipe any data from previous runs ───────────────────
                async function cleanData(
                    assert: typeof Assert,
                    {$meta, createTable}: StepMeta & {createTable: Promise<unknown>},
                ) {
                    await createTable;
                    await sqlItemDelete({}, $meta);
                    return {cleaned: true};
                },

                // ── 3. add — insert a single row ──────────────────────────
                async function addItem(
                    assert: typeof Assert,
                    {$meta, cleanData}: StepMeta & {cleanData: Promise<unknown>},
                ) {
                    await cleanData;
                    const result = await sqlItemAdd({...items[0]}, $meta);
                    assert.ok(result, 'add returned a result');
                    assert.ok(
                        (result as AddResult).itemId,
                        'add returned an itemId',
                    );
                    return result as AddResult;
                },

                // ── 4. get — fetch the inserted row by primary key ────────
                async function getItem(
                    assert: typeof Assert,
                    {$meta, addItem}: StepMeta & {addItem: Promise<AddResult>},
                ) {
                    const {itemId} = await addItem;
                    const result = await sqlItemGet({itemId}, $meta);
                    assert.ok(result, 'get returned a result');
                    assert.strictEqual(
                        (result as ItemRow).itemName,
                        items[0].itemName,
                        'get returned the correct itemName',
                    );
                    assert.strictEqual(
                        (result as ItemRow).itemDescription,
                        items[0].itemDescription,
                        'get returned the correct itemDescription',
                    );
                    return result as ItemRow & {itemId: number};
                },

                // ── 5. find — query rows with a filter ───────────────────
                async function findItems(
                    assert: typeof Assert,
                    {$meta, addItem}: StepMeta & {addItem: Promise<AddResult>},
                ) {
                    await addItem;
                    const result = await sqlItemFind({itemName: items[0].itemName}, $meta);
                    assert.ok(Array.isArray(result), 'find returned an array');
                    assert.ok(
                        (result as ItemRow[]).length >= 1,
                        'find returned at least one row',
                    );
                    assert.ok(
                        (result as ItemRow[]).every(r => r.itemName === items[0].itemName),
                        'all returned rows match the filter',
                    );
                    return result as ItemRow[];
                },

                // ── 6. edit — update a row by primary key ─────────────────
                async function editItem(
                    assert: typeof Assert,
                    {$meta, getItem}: StepMeta & {getItem: Promise<ItemRow & {itemId: number}>},
                ) {
                    const {itemId} = await getItem;
                    const result = await sqlItemEdit({itemId, ...updatedItem}, $meta);
                    assert.ok(result !== undefined, 'edit returned a result');
                    return {itemId};
                },

                // ── 7. verify edit — re-fetch to confirm the update ───────
                async function verifyEdit(
                    assert: typeof Assert,
                    {$meta, editItem}: StepMeta & {editItem: Promise<{itemId: number}>},
                ) {
                    const {itemId} = await editItem;
                    const result = await sqlItemGet({itemId}, $meta);
                    assert.ok(result, 'get after edit returned a result');
                    assert.strictEqual(
                        (result as ItemRow).itemName,
                        updatedItem.itemName,
                        'itemName was updated correctly',
                    );
                    assert.strictEqual(
                        (result as ItemRow).itemDescription,
                        updatedItem.itemDescription,
                        'itemDescription was updated correctly',
                    );
                    return result as ItemRow;
                },

                // ── 8. remove — delete the row by primary key ─────────────
                async function removeItem(
                    assert: typeof Assert,
                    {$meta, verifyEdit, editItem}: StepMeta & {
                        verifyEdit: Promise<ItemRow>;
                        editItem: Promise<{itemId: number}>;
                    },
                ) {
                    await verifyEdit;
                    const {itemId} = await editItem;
                    const result = await sqlItemRemove({itemId}, $meta);
                    assert.ok(result !== undefined, 'remove returned a result');
                    return {itemId, removed: true};
                },

                // ── 9. merge — upsert a new row ───────────────────────────
                async function mergeItem(
                    assert: typeof Assert,
                    {$meta, removeItem}: StepMeta & {removeItem: Promise<unknown>},
                ) {
                    await removeItem;
                    const result = await sqlItemMerge({...mergedItem}, $meta);
                    assert.ok(result !== undefined, 'merge returned a result');
                    return {merged: true};
                },

                // ── 10. insert — bulk insert multiple rows ────────────────
                async function insertItems(
                    assert: typeof Assert,
                    {$meta, mergeItem}: StepMeta & {mergeItem: Promise<unknown>},
                ) {
                    await mergeItem;
                    const result = await sqlItemInsert(items.map(i => ({...i})), $meta);
                    assert.ok(result !== undefined, 'insert returned a result');
                    return {inserted: true};
                },

                // ── 11. verify bulk insert ────────────────────────────────
                async function verifyInsert(
                    assert: typeof Assert,
                    {$meta, insertItems}: StepMeta & {insertItems: Promise<unknown>},
                ) {
                    await insertItems;
                    const result = await sqlItemFind({}, $meta);
                    assert.ok(Array.isArray(result), 'find after bulk insert returned an array');
                    assert.ok(
                        (result as ItemRow[]).length >= items.length,
                        'at least as many rows as inserted fixtures',
                    );
                    return {rowCount: (result as ItemRow[]).length};
                },

                // ── 12. find with limit and order ─────────────────────────
                async function findWithOptions(
                    assert: typeof Assert,
                    {$meta, verifyInsert}: StepMeta & {verifyInsert: Promise<unknown>},
                ) {
                    await verifyInsert;
                    const result = await sqlItemFind({limit: 2, order: 'itemName'}, $meta);
                    assert.ok(Array.isArray(result), 'find with limit returned an array');
                    assert.ok(
                        (result as ItemRow[]).length <= 2,
                        'find respects the limit parameter',
                    );
                    return result as ItemRow[];
                },

                // ── 13. delete — bulk delete matching rows ────────────────
                async function deleteItems(
                    assert: typeof Assert,
                    {$meta, findWithOptions}: StepMeta & {findWithOptions: Promise<unknown>},
                ) {
                    await findWithOptions;
                    const result = await sqlItemDelete({itemName: items[0].itemName}, $meta);
                    assert.ok(result !== undefined, 'delete returned a result');
                    return {deleted: true};
                },

                // ── 14. Drop the test table (cleanup) ─────────────────────
                async function dropTable(
                    assert: typeof Assert,
                    {$meta, deleteItems}: StepMeta & {
                        deleteItems: Promise<unknown>;
                    },
                ) {
                    await deleteItems;
                    const result = await sqlTableDrop({}, $meta);
                    assert.ok(result, 'Table drop returned a result');
                    return result as {table: string; dropped: boolean};
                },
            ]),
    }),
);
