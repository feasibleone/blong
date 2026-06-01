import {handler, type IAssert} from '@feasibleone/blong';

type SchemaAddResult = {schemaItemId: number};
type StepMeta = {$meta: Record<string, unknown>};

/**
 * testMysqlSchema — integration test for declarative schema management in the
 * knex adapter.
 *
 * The `schema_item` table and `sql_schema_list_active` procedure are declared in
 * `mysql/adapter/sql.ts` under `activation.default.schema`.  The adapter syncs
 * them automatically in its `ready()` lifecycle hook, so by the time any test
 * step runs the table and procedure already exist.
 *
 * The test verifies:
 *   1. The table was auto-created (confirmed by successfully inserting a row).
 *   2. The `sqlSchemaListActive` synthetic procedure handler, discovered at
 *      start-up and wired onto the adapter object, is reachable via normal
 *      framework dispatch and returns the expected rows.
 *   3. The `schemaTableSync` helper is idempotent (no changes on a second call).
 *   4. The table is dropped at the end so the next run exercises the CREATE path.
 *
 * Explicit calls to the schema helper methods (`sqlSchemaTableSync`,
 * `sqlSchemaCrudBind`, `sqlSchemaProcedureSync`, `sqlSchemaProcedureBind`) are
 * kept only where they add coverage or are needed for setup / cleanup.
 */
export default handler(
    ({
        lib: {group, checkpoint},
        handler: {
            sqlSchemaTableSync,
            sqlSchemaTableDrop,
            sqlSchemaItemAdd,
            sqlSchemaItemFind,
            sqlSchemaItemRemove,
            sqlSchemaListActive,
        },
    }) => ({
        testMysqlSchema: ({name = 'mysql schema'}: {name?: string}) =>
            group(name, {mask: ['schemaItemId', '*.schemaItemId']})([
                // ── 1. Clean any data left from a previous run ───────────────────
                //    The table exists because the adapter already ran ready().
                //    CRUD handlers are auto-bound by the knex adapter in ready()
                //    when `config.namespace` is set — no explicit call to
                //    `schemaCrudBind` needed.
                async function cleanData(assert: IAssert, {$meta}: StepMeta) {
                    const allRows = (await sqlSchemaItemFind({}, $meta)) as Array<{
                        schemaItemId: number;
                    }>;
                    for (const row of allRows)
                        await sqlSchemaItemRemove({schemaItemId: row.schemaItemId}, $meta);
                    assert.ok(true, 'cleaned schema_item data');
                    return {cleaned: true};
                },

                // ── 2. Insert an active item so the procedure can return it ──────
                async function addActiveItem(
                    assert: IAssert,
                    {$meta, cleanData}: StepMeta & {cleanData: Promise<unknown>},
                ) {
                    await cleanData;
                    const result = (await sqlSchemaItemAdd(
                        {
                            schemaItemName: 'Active Schema Item',
                            schemaItemActive: true,
                        },
                        $meta,
                    )) as SchemaAddResult;
                    assert.ok(result?.schemaItemId, 'add returned a schemaItemId');
                    return result;
                },

                // ── 3. Call the *synthetic* procedure handler via normal dispatch ─
                //    `sqlSchemaListActive` is NOT a registered handler file — it is
                //    created at runtime by `_bindSyntheticHandlers` in ready() and
                //    stored on the adapter object as an own property.  Calling it
                //    through the handler proxy verifies the full synthetic-handler
                //    dispatch path.
                async function callSyntheticProcedure(
                    assert: IAssert,
                    {$meta, addActiveItem}: StepMeta & {addActiveItem: Promise<SchemaAddResult>},
                ) {
                    await addActiveItem;
                    const result = await (
                        sqlSchemaListActive as (
                            p: object,
                            m: Record<string, unknown>,
                        ) => Promise<unknown[]>
                    )({}, $meta);
                    assert.ok(Array.isArray(result), 'synthetic procedure returned an array');
                    assert.ok(result.length > 0, 'synthetic procedure returned active items');
                    return result;
                },

                // ── 4. Idempotency: second schemaTableSync must be a no-op ────────
                //    Calls the helper directly for coverage of the ALTER path.
                async function verifyIdempotency(
                    assert: IAssert,
                    {
                        $meta,
                        callSyntheticProcedure,
                    }: StepMeta & {callSyntheticProcedure: Promise<unknown>},
                ) {
                    await callSyntheticProcedure;
                    const result = await sqlSchemaTableSync({}, $meta);
                    const r = result as {created: boolean; added: string[]; dropped: string[]};
                    assert.equal(r.created, false, 'second sync does not recreate table');
                    assert.deepEqual(r.added, [], 'no columns added on second sync');
                    return result;
                },

                // ── 5. Drop the test table so the next run tests the CREATE path ──
                async function dropTable(
                    assert: IAssert,
                    {$meta, verifyIdempotency}: StepMeta & {verifyIdempotency: Promise<unknown>},
                ) {
                    await verifyIdempotency;
                    await sqlSchemaTableDrop({}, $meta);
                    assert.ok(true, 'schema_item table dropped');
                    return checkpoint('schema table dropped');
                },
            ]),
    }),
);
