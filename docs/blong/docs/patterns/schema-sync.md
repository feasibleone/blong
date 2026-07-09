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

const __dirname = dirname(fileURLToPath(import.meta.url));

export default adapter(({schema}) => ({
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
                        definition: schema.mysql.item,  // TypeBox TObject
                        order: 1,                       // creation order (FK dependencies)
                        dropColumns: true,              // allow dropping removed columns
                    },
                },

                // Seed data (production)
                seed: true,

                // Test seed data (dev/integration only)
                dbTest: true,

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
| `seed`             | `boolean`                        | `false`  | Enable production seed data from `.db.asset` YAML/JSON files      |
| `dbTest`           | `boolean`                        | `false`  | Enable test seed data from `.dbTest.asset` YAML/JSON files        |
| `procedurePaths`   | `string[]`                       | `[]`     | Folders scanned for `*.sql` files (base name = procedure name)    |
| `procedures`       | `Record<string, string>`         | `{}`     | Inline procedure SQL (backward compat; prefer `procedurePaths`)   |

`namespace` is a sibling field next to `schema`, not inside it.  It controls the prefix of all
auto-bound handler names.

---

## Table schema definition

Place the TypeBox `TObject` in the `meta/type` folder so it can be reused:

```typescript
// mysql/meta/type/schema.ts
import {schema} from '@feasibleone/blong';

export default schema(async ({lib: {type}}) => ({
    item: type.Object({
        itemId: type.Integer({format: 'int64'}),
        itemName: type.String(),
        itemActive: type.Optional(type.Boolean()),
    }),
}));
```

**Column rules:**

- **Property names** are used as SQL column names verbatim (camelCase is preserved).
- Any property whose name ends in `Id` and has type `Type.Integer()` is created as an
  `AUTO_INCREMENT` primary key column.
- Any property whose name ends in `Id` and has any other type (e.g. `Type.String()`) is treated
  as a plain column — no auto-increment.
- Properties listed in the schema's `required` array generate `NOT NULL` columns; all others
  are nullable.
- Use `dropColumns: true` in the `ISchemaTable` spec to let the adapter remove columns that are
  no longer present in the TypeBox schema.

### TypeBox → SQL type mapping

| TypeBox type                         | SQL column type                                         |
| ------------------------------------ | ------------------------------------------------------- |
| `Type.Integer()`                     | `INT` / `AUTO_INCREMENT` (if name ends `Id`)            |
| `Type.String({maxLength: N≤255})`    | `VARCHAR(N)`                                            |
| `Type.String({maxLength: N>255})`    | `TEXT`                                                  |
| `Type.String()` (no maxLength)       | `VARCHAR(255)` (default when no maxLength given)        |
| `Type.String({format: 'date-time'})` | `DATETIME`                                              |
| `Type.String({format: 'date'})`      | `DATE`                                                  |
| `Type.String({format: 'uuid'})`      | `UUID`                                                  |
| `Type.Boolean()`                     | `BOOLEAN`                                               |
| `Type.Number()`                      | `DOUBLE`                                                |
| `Type.Unknown()` / `Type.Object()`   | `JSON`                                                  |
| `Type.Optional(T)`                   | nullable column                                         |

---

## Constraint definitions

Table-level constraints (composite primary keys, unique constraints, foreign keys, indexes) are
declared via the **second argument** to `type.Object()`:

```typescript
type.Object(
    {
        itemId: type.Integer(),
        itemName: type.String(),
        categoryId: type.Integer(),
    },
    {
        constraints: {
            // Composite primary key
            primaryKey: {columns: ['itemId', 'categoryId']},

            // Unique constraint (key = constraint name, value = options)
            unique: {
                itemName: {},
            },

            // Foreign keys — string form (simple) or object form (with options)
            foreign: {
                categoryId: 'realmname.category.categoryId',
                // — OR with cascade:
                // categoryId: {
                //     references: 'realmname.category.categoryId',
                //     onDelete: 'CASCADE',
                // },
            },

            // Indexes
            index: {
                itemName: {},
                // — OR with index type:
                // itemName: {indexType: 'FULLTEXT'},
            },
        },
    },
);
```

### Constraint reference

| Constraint  | Type form                                                       | Description                                       |
| ----------- | --------------------------------------------------------------- | ------------------------------------------------- |
| `primaryKey` | `string` (single column) or `{columns, constraintName?}`       | Composite primary key. Single-column PKs are auto-detected via `*Id` + `Integer` and do not need to be declared here. |
| `unique`    | `Record<string, {columns?}>`                                   | Unique constraint. Key = constraint name (used to generate `{table}_ux_{key}`). Omit `columns` to apply to the key-named column. |
| `foreign`   | `Record<string, string\|{references, columns?, onDelete?, onUpdate?}>` | Foreign key. `references` uses `{table}.{column}` format. Key = local column name. |
| `index`     | `Record<string, {columns?, indexType?}>`                       | Index. `indexType` can be `'FULLTEXT'`, `'SPATIAL'`, etc. Key = index name (used to generate `{table}_idx_{key}`). |

### Two-pass constraint sync

Constraints are applied in a **separate pass** after all tables have been created. This is
necessary because foreign keys reference other tables that must already exist.

```
Pass 1 — schemaTableSyncImpl:
  Create/alter all tables in ascending `order`

Pass 2 — schemaTableConstraintSyncImpl:
  Apply composite PKs, unique constraints, indexes, foreign keys
```

Both passes are **idempotent**. Already-present constraints (checked via
`information_schema.TABLE_CONSTRAINTS` and `information_schema.STATISTICS`) are skipped.
Running the sync multiple times on an unchanged schema produces zero SQL.

### Constraint naming

| Constraint type | Generated name pattern | Example |
| --------------- | ---------------------- | ------- |
| Primary key     | `{table}_pk`           | `realmname_item_pk` |
| Unique          | `{table}_ux_{key}`     | `realmname_item_ux_itemName` |
| Index           | `{table}_idx_{key}`    | `realmname_item_idx_itemName` |
| Foreign key     | `{table}_fk_{key}`     | `realmname_item_fk_categoryId` |

---

## Seed data files

Seed data is provided via YAML (`.yaml`) files placed in handler folders. The framework's Watch
mechanism automatically wraps any `.yaml`/`.yml`/`.json` file in a handler folder as an **asset
module**. The knex adapter's `ready()` hook processes these assets when the relevant config flags
are enabled.

### Production seeds (`.db.asset`)

Place YAML files in the `meta/db/` folder alongside `db.ts`. They are processed when
`schema.seed: true` via `processSeedAssets(ctx, /\.db\.asset$/)`.

```
realmname/meta/db/
├── db.ts
├── 0-coreTypeMerge.yaml       ← .db.asset — production seed
└── realmnameRoleMerge.yaml      ← .db.asset — production seed
```

**Method name derivation:** The method name is the part of the filename after the **last `-`**
character (minus the extension). Examples:

| Filename | Method name |
|---|---|
| `0-coreTypeMerge.yaml` | `coreTypeMerge` |
| `realmnameRoleMerge.yaml` | `realmnameRoleMerge` |
| `accessRoleMerge.yaml` | `accessRoleMerge` |

**Processing:** Each file is parsed (YAML or JSON) and dispatched via `ctx.handle!(params, {method})`.
The YAML content becomes the params object:

```yaml
# realmnameRoleMerge.yaml
resourceType: realmname.role
role:
  - roleBit: 0
    name: Admin
    description: Full access
```

This dispatches to `{handlerMethod}({resourceType: 'realmname.role', role: [...]}, {method: 'realmnameRoleMerge'})`.

### Test seeds (`.dbTest.asset`)

Place YAML files in the `meta/dbTest/` folder. They are processed when both `schema.seed: true`
AND `schema.dbTest: true` via `processSeedAssets(ctx, /\.dbTest\.asset$/)`.

```
realmname/meta/dbTest/
└── realmnameEntityMerge.yaml    ← .dbTest.asset — test seed only
```

Test seeds follow the same naming and processing rules as production seeds, but are only loaded
in `dev` and `integration` intents — never in `upgrade` or `microservice`.

### Intent-specific behaviour

| Intent | `schema.seed` | `schema.dbTest` |
|---|---|---|
| `dev` | ✅ | ✅ |
| `integration` | ✅ | ✅ |
| `upgrade` | ✅ | ❌ |
| `microservice` | ❌ | ❌ |

---

## Stored procedure files

Place each procedure in its own `.sql` file inside a sub-folder named `schema` (by convention):

```text
mysql/adapter/sql/schema/sql_item_list_active.sql
```

```sql
CREATE PROCEDURE `sql_item_list_active`()
BEGIN
    SELECT * FROM `item` WHERE `itemActive` = 1;
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
own-property handler on the adapter.  For a procedure named `sql_item_list_active`:

```text
sql_item_list_active  →  sqlItemListActive  (camelCase, for super calls)
                      →  sqlitemlistactive  (methodId, for framework dispatch)
```

Call it from any orchestrator or test step exactly like a registered handler:

```typescript
const rows = await handler.sqlItemListActive({}, $meta);
```

Input parameters are mapped from camelCase object keys matching the procedure's `IN`/`INOUT`
parameters (declared order is respected).  For a procedure parameter named `item_status`, the
caller passes `{itemStatus: value}`.

---

## Auto-bound CRUD handlers

When `namespace` is set, the adapter generates six CRUD handlers for every declared table, stored
as synthetic own-property handlers (same mechanism as procedures):

| Handler name pattern            | Example (`namespace=sql`, `table=item`) |
| ------------------------------- | --------------------------------------- |
| `${ns}${Table}Get`              | `sqlItemGet`                            |
| `${ns}${Table}Find`             | `sqlItemFind`                           |
| `${ns}${Table}Add`              | `sqlItemAdd`                            |
| `${ns}${Table}Edit`             | `sqlItemEdit`                           |
| `${ns}${Table}Remove`           | `sqlItemRemove`                         |
| `${ns}${Table}Merge`            | `sqlItemMerge`                          |

These are bound **automatically** — no handler files are needed.  To use them from a test or
orchestrator, import them by name in the `handler:{}` proxy:

```typescript
handler: {sqlItemAdd, sqlItemFind, sqlItemRemove}
```

---

## Overriding a synthetic handler

A handler file placed in the adapter layer whose name matches a synthetic handler takes precedence
because registered realm handlers sit higher in the prototype chain than synthetic own-property
handlers.

To delegate back to the synthetic version, use `super` with the **camelCase name** stored on the
adapter object:

```typescript
// mysql/adapter/sql/sqlItemListActive.ts
import {handler} from '@feasibleone/blong';

export default handler(
    () => ({
        async sqlItemListActive(params, $meta) {
            // Delegate to the synthetic procedure handler, then post-filter
            const rows = await (super as unknown as Record<
                string,
                (p: object, m: object) => Promise<unknown[]>
            >).sqlItemListActive(params, $meta);
            return (rows as Array<{itemActive: boolean}>).filter(r => r.itemActive);
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
Step 1 — cleanData:           sqlItemFind → sqlItemRemove (auto-bound CRUD)
Step 2 — addActiveItem:       sqlItemAdd   (auto-bound CRUD)
Step 3 — callSyntheticProc:   sqlItemListActive (synthetic procedure handler)
Step 4 — verifyIdempotency:   sqlSchemaTableSync → assert created:false, added:[]
Step 5 — dropTable:           sqlSchemaTableDrop  (cleanup so next run exercises CREATE)
```

Step 4 calls `sqlSchemaTableSync` explicitly only because it tests the idempotency guarantee — in
production code you would never need to call it manually.
