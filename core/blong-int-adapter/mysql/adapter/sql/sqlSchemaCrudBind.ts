import {handler} from '@feasibleone/blong';
import {schemaItemSchema} from './schemaItemSchema.ts';

/**
 * sqlSchemaCrudBind — calls the knex adapter's built-in `schemaCrudBind` method
 * to generate CRUD handler functions for the `schema_item` table.
 *
 * Returns the generated `handlers` map so the test layer can invoke CRUD
 * operations directly without having to wire them as separate API methods.
 */
export default handler(
    () =>
        async function sqlSchemaCrudBind(
            _params: Record<string, unknown>,
            _$meta: Record<string, unknown>,
        ) {
            return (
                this.schemaCrudBind as (...args: unknown[]) => Promise<{
                    handlers: Record<string, (params: Record<string, unknown>) => Promise<unknown>>;
                    schemas: Record<string, unknown>;
                }>
            )('sql', 'schemaItem', schemaItemSchema, [], 'schema_item');
        },
);
