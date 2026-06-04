import {handler, type IAssert} from '@feasibleone/blong';
import {type TArray, type TObject} from 'typebox';

type StepMeta = {$meta: Record<string, unknown>};

/**
 * testMysqlObjectSchema — verifies that `schema()` exports are collected into
 * the registry objectSchema and that schema reuse works correctly.
 *
 * The test checks two schemas declared in the `mysql.sql` handler group:
 *   - `item` — registered by `meta/type/schema.ts`, wraps the
 *     existing `schemaItemSchema` TypeBox definition.
 *   - `itemPage` — registered by `meta/type/schemaPage.ts`,
 *     reuses `item` as its `items` array element type.
 *
 * The key assertion is that `itemPage.properties.item.items` is the
 * identical structure as `item`, confirming reuse
 */
export default handler(({lib: {group}, schema: {item, itemPage}}) => ({
    testMysqlObjectSchema: ({name = 'mysql objectSchema'}: {name?: string}) =>
        group(name)([
            // ── 1. Verify both schemas are present in objectSchema ────────────
            async function schemasRegistered(assert: IAssert, {$meta: _$meta}: StepMeta) {
                assert.ok(item != null, 'item is registered in objectSchema');
                assert.ok(itemPage != null, 'itemPage is registered in objectSchema');
                return {verified: true};
            },

            // ── 2. Verify itemPage reuses item schema ───────────────
            async function itemPageReusesItem(
                assert: IAssert,
                {schemasRegistered}: StepMeta & {schemasRegistered: Promise<{verified: boolean}>},
            ) {
                await schemasRegistered;
                const pageSchema = itemPage as TObject | undefined;
                const itemsArraySchema = pageSchema?.properties?.item as TArray | undefined;
                assert.ok(itemsArraySchema != null, 'itemPage has an item property');
                assert.deepEqual(
                    itemsArraySchema?.items,
                    item,
                    'itemPage.item array element type has the same schema as item',
                );
                return {reuse: true};
            },

            // ── 3. Verify item has the expected property shape ───────
            async function itemShape(assert: IAssert) {
                const itemSchema = item as TObject | undefined;
                assert.ok('itemId' in (itemSchema?.properties ?? {}), 'item has itemId property');
                assert.ok(
                    'itemName' in (itemSchema?.properties ?? {}),
                    'item has itemName property',
                );
                return {shape: true};
            },
        ]),
}));
