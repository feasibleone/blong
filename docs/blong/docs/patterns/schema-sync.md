# Schema Management Patterns (knex adapter)

This page provides implementation details for the declarative schema management feature of
`adapter.knex`.  See the [concept overview](../concepts/schema-sync.md) for a high-level
description and the [rationale](../rationale/schema-sync.md) for design motivation.

---

## Full adapter configuration

```typescript
// mysql/adapter/sql.ts
import {adapter} from '@feasibleone/blong';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {schemaItemSchema} from './sql/schemaItemSchema.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default adapter(() => ({
    extends: 'adapter.knex',
    activation: {
        default: {
            knex: {
                connection: {database: 'demo', user: 'app', password: 'secret'},
            },
            namespace: 'sql',          // prefix for auto-bound CRUD and procedure handlers
            imports: ['mysql.sql'],    // handler group name for dispatch routing

            schema: {
                sync: true,            // run DDL (deployment job only, not normal startup)

                tables: {
                    // SQL table name → ISchemaTable spec (or plain TObject)
                    schema_item: {
                        definition: schemaItemSchema,   // TypeBox TObject
                        order: 1,                       // creation order (FK dependencies)
                        dropColumns: true,              // allow dropping removed columns
                    },
                },

                // Preferred: scan a folder for *.sql files
                procedurePaths: [join(__dirname, 'sql/schema')],

                // Backward-compatible: inline SQL strings
                // procedures: {
                //     sql_schema_list_active: `CREATE PROCEDURE ...`,
                // },
            },
        },
    },
}));
```

### `schema` config fields

| Field              | Type                             | Default  | Description                                                       |
| ------------------ | -------------------------------- | -------- | ----------------------------------------------------------------- |
| `sync`             | `boolean`                        | `false`  | Enable schema sync (deployment-time job only, not normal startup) |
| `tables`           | `Record<string, ISchemaTable\|TObject>` | `{}` | Tables to create/alter                                       |
| `procedurePaths`   | `string[]`                       | `[]`     | Folders scanned for `*.sql` files (base name = procedure name)    |
| `procedures`       | `Record<string, string>`         | `{}`     | Inline procedure SQL (backward compat; prefer `procedurePaths`)   |

`namespace` is a sibling field next to `schema`, not inside it.  It controls the prefix of all
auto-bound handler names.

---

## Table schema definition

Place the TypeBox `TObject` in the adapter's `sql/` folder so it can be imported by both the
adapter activation config and any handler overrides or tests:

```typescript
// mysql/adapter/sql/schemaItemSchema.ts
import {Type} from 'typebox';

export const schemaItemSchema = Type.Object(
    {
        schemaItemId:          Type.Integer(),
        schemaItemName:        Type.String({maxLength: 255}),
        schemaItemDescription: Type.Optional(Type.String({maxLength: 1000})),
        schemaItemActive:      Type.Optional(Type.Boolean()),
    },
    {required: ['schemaItemId', 'schemaItemName']},
);
```

**Column rules:**

- **Property names** are used as SQL column names verbatim (camelCase is preserved).
- Any property whose name ends in `Id` and has type `Type.Integer()` is created as an
  `AUTO_INCREMENT` primary key column.
- Properties listed in the schema's `required` array generate `NOT NULL` columns; all others
  are nullable.
- Use `dropColumns: true` in the `ISchemaTable` spec to let the adapter remove columns that are
  no longer present in the TypeBox schema.

### TypeBox → SQL type mapping

| TypeBox type                      | SQL column type         |
| --------------------------------- | ----------------------- |
| `Type.Integer()`                  | `INT` / `AUTO_INCREMENT` (if name ends `Id`) |
| `Type.String({maxLength: N})`     | `VARCHAR(N)`            |
| `Type.String()` (no maxLength)    | `TEXT`                  |
| `Type.String({format: 'date-time'})` | `DATETIME`           |
| `Type.String({format: 'date'})`   | `DATE`                  |
| `Type.String({format: 'uuid'})`   | `UUID`                  |
| `Type.Boolean()`                  | `BOOLEAN`               |
| `Type.Number()`                   | `DOUBLE`                |
| `Type.Unknown()` / `Type.Object()` | `JSON`                 |
| `Type.Optional(T)`                | nullable column         |

---

## Stored procedure files

Place each procedure in its own `.sql` file inside a sub-folder named `schema` (by convention):

```text
mysql/adapter/sql/schema/sql_schema_list_active.sql
```

```sql
CREATE PROCEDURE `sql_schema_list_active`()
BEGIN
    SELECT * FROM `schema_item` WHERE `schemaItemActive` = 1;
END
```

The file's base name (without `.sql`) becomes the SQL procedure name.  The adapter compares the
procedure body against `information_schema.ROUTINES.ROUTINE_DEFINITION` and only re-creates the
procedure when the body differs — so repeated restarts with an unchanged schema produce no SQL.

### Private procedures (underscore prefix)

Name a procedure `_my_helper` to mark it as a **private DB helper**.  It will be synced to the
database but **not** exposed as a synthetic handler on the API surface.

---

## Auto-bound synthetic handlers

After `ready()`, every procedure whose name does **not** start with `_` is callable as a synthetic
own-property handler on the adapter.  For a procedure named `sql_schema_list_active`:

```text
sql_schema_list_active  →  sqlSchemaListActive  (camelCase, for super calls)
                        →  sqlschemalistactive  (methodId, for framework dispatch)
```

Call it from any orchestrator or test step exactly like a registered handler:

```typescript
const rows = await handler.sqlSchemaListActive({}, $meta);
```

Input parameters are mapped from camelCase object keys matching the procedure's `IN`/`INOUT`
parameters (declared order is respected).  For a procedure parameter named `item_status`, the
caller passes `{itemStatus: value}`.

---

## Auto-bound CRUD handlers

When `namespace` is set, the adapter generates six CRUD handlers for every declared table, stored
as synthetic own-property handlers (same mechanism as procedures):

| Handler name pattern            | Example (`namespace=sql`, `table=schema_item`) |
| ------------------------------- | ---------------------------------------------- |
| `${ns}${Table}Get`              | `sqlSchemaItemGet`                             |
| `${ns}${Table}Find`             | `sqlSchemaItemFind`                            |
| `${ns}${Table}Add`              | `sqlSchemaItemAdd`                             |
| `${ns}${Table}Edit`             | `sqlSchemaItemEdit`                            |
| `${ns}${Table}Remove`           | `sqlSchemaItemRemove`                          |
| `${ns}${Table}Merge`            | `sqlSchemaItemMerge`                           |

These are bound **automatically** — no handler files are needed.  To use them from a test or
orchestrator, import them by name in the `handler:{}` proxy:

```typescript
handler: {sqlSchemaItemAdd, sqlSchemaItemFind, sqlSchemaItemRemove}
```

---

## Overriding a synthetic handler

A handler file placed in the adapter layer whose name matches a synthetic handler takes precedence
because registered realm handlers sit higher in the prototype chain than synthetic own-property
handlers.

To delegate back to the synthetic version, use `super` with the **camelCase name** stored on the
adapter object:

```typescript
// mysql/adapter/sql/sqlSchemaListActive.ts
import {handler} from '@feasibleone/blong';

export default handler(
    () => ({
        async sqlSchemaListActive(params, $meta) {
            // Delegate to the synthetic procedure handler, then post-filter
            const rows = await (super as unknown as Record<
                string,
                (p: object, m: object) => Promise<unknown[]>
            >).sqlSchemaListActive(params, $meta);
            return (rows as Array<{schemaItemActive: boolean}>).filter(r => r.schemaItemActive);
        },
    }),
);
```

Note: the `super` key is the **camelCase** name (not the `methodId` lowercase form), because the
framework stores synthetic handlers under both keys to support this pattern.

---

## Explicit schema helper methods

The adapter also exposes schema operations as callable handler methods for cases where explicit
imperative control is needed (e.g., integration test cleanup or one-off migrations):

| Handler                  | Description                                                  |
| ------------------------ | ------------------------------------------------------------ |
| `sqlSchemaTableSync`     | Create or alter a specific table to match a TypeBox schema   |
| `sqlSchemaTableDrop`     | Drop a specific table                                        |
| `sqlSchemaCrudBind`      | Return CRUD handler closures bound to a specific table       |
| `sqlSchemaProcedureSync` | Create / replace a list of stored procedures                 |
| `sqlSchemaProcedureBind` | Discover all procedures and return them as handler closures  |

For normal development the declarative config path is preferred over these helpers.

---

## Integration test pattern

The `blong-int-adapter` mysql suite demonstrates the full declarative path in
`mysql/test/test/testMysqlSchema.ts`.  The table and procedure are created by the adapter's
`ready()` hook before any test step runs — the test does not call `sqlSchemaTableSync` or
`sqlSchemaProcedureSync` for setup.

```text
Step 1 — cleanData:           sqlSchemaItemFind → sqlSchemaItemRemove (auto-bound CRUD)
Step 2 — addActiveItem:       sqlSchemaItemAdd   (auto-bound CRUD)
Step 3 — callSyntheticProc:   sqlSchemaListActive (synthetic procedure handler)
Step 4 — verifyIdempotency:   sqlSchemaTableSync → assert created:false, added:[]
Step 5 — dropTable:           sqlSchemaTableDrop  (cleanup so next run exercises CREATE)
```

Step 4 calls `sqlSchemaTableSync` explicitly only because it tests the idempotency guarantee — in
production code you would never need to call it manually.
