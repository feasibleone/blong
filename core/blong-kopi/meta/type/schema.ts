import {schema} from '@feasibleone/blong';

/**
 * meta/type/schema.ts — `$subject` table definitions.
 *
 * Two entities (master-detail):
 *  - `$object` — header (id, name, status, creation time)
 *  - `line` — detail rows (name, quantity) attached to a `$object`
 *
 * The `$objectId`/`lineId` auto-increment PKs are filled by the database on
 * insert; seeds reference them by explicit integer ids. `$objectStatus` is a
 * short code (`draft`, `sent`, `paid`, `void`) validated by the handlers.
 *
 * Server-managed audit fields (e.g. `createdAt`) MUST be nullable
 * (`type.dateTimeNull()`) — the gateway auto-validates CRUD params against the
 * table's `NotNull` columns (`subject.validation`).
 */
export default schema(async ({lib: {type}}) => ({
    $object: type.Object(
        {
            $objectId: type.increment(),
            $objectName: type.stringNotNull({maxLength: 50}),
            $objectStatus: type.stringNotNull({maxLength: 20}),
            createdAt: type.dateTimeNull(),
        },
        {
            constraints: {
                unique: {
                    $objectName: {},
                },
            },
        },
    ),

    line: type.Object(
        {
            lineId: type.increment(),
            // `$subject.$object.$objectId` is a BIGINT UNSIGNED auto-increment, so
            // the FK column must also be bigint (unsigned) to be compatible.
            $objectId: type.bigIntNotNull(),
            lineName: type.stringNotNull(),
            lineQuantity: type.numberNotNull(),
        },
        {
            constraints: {
                foreign: {
                    $objectId: '$subject.$object.$objectId',
                },
                index: {
                    $objectId: {},
                },
            },
        },
    ),
}));
