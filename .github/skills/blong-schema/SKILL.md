---
name: blong-schema
description:
    Define database schemas, seed data, and test seed data in a Blong realm using the declarative
    schema management system built into adapter.knex. Covers the full lifecycle - TypeBox table
    definitions (with constraints like primary keys, foreign keys, unique constraints, and indexes),
    stored procedure `.sql` files, production seed YAML files, test seed YAML files, and the adapter
    configuration that wires everything together. Use this skill whenever the user wants to add or
    modify database tables, add seed data, add test seed data, define stored procedures, add
    constraints to tables, or set up the schema layer for a realm - even if they just say 'add a
    table', 'add seed data', 'I need a DB schema', or 'set up the database for this realm'.
---

# Declarative Schema Management (blong-schema)

## [CRITICAL_GUARDRAILS]

- **Use convenience types, never raw TypeBox** (`type.increment()`, `type.stringNotNull()`, …) —
  never `Type.String()` / `Type.Integer()` / `Type.Optional(T)`.
- **Seeds are always YAML, never TypeScript.** TypeScript files only for custom merge logic (Case
  3).
- **`*JSON` columns are auto-(de)serialized** — declare as `type.stringNull()`; no manual
  parse/stringify.
- **No `type.Optional()` needed** — the `Null`/`NotNull` suffix already implies nullability.
- **Constraints apply in a second pass** after all tables exist (FK targets guaranteed).
- **Don't recreate the built-in `adapter/db.ts`** — extend via `schema.tables` / `procedurePaths`.
- **Name PKs/FKs deliberately:** `increment` (simple PK) · `ulid`/`uuid` (distributed PK) · `uid`
  (FK).
- **[FK_TYPING]** An FK column referencing an `increment()` PK must be `type.bigIntNotNull()` — the
  PK is BIGINT UNSIGNED; `type.uid*` FKs only point to `ulid`/`uuid` PKs. Also avoid chained knex FK
  options (`onDelete`) on such FKs — the current knex crashes with `fkr.onDelete is not a function`;
  use a plain string FK reference (`'subject.object.column'`).
- **[AUTO_VALIDATION]** The gateway auto-validates CRUD params against the table's `NotNull` columns
  (`subject.validation` for public models). Server-managed audit fields (e.g. `createdAt`) must be
  nullable (`type.dateTimeNull()`), or `add`/`edit` fail with
  `Validation failed: must have required properties ... createdAt`.

Canonical framework rules + archetype: `.github/skills/_shared/conventions.md` →
`[CRITICAL_GUARDRAILS]`, `[ARCHETYPE: SCHEMA_TABLE]`.

## Overview

`adapter.knex` in `blong-gogo` = **declarative schema management** — declare the desired state
(tables/constraints/procedures/seeds) as TypeBox + YAML; the framework reconciles the DB
automatically (no migration files). Concerns run at different times:

| Concern               | When it runs                     | Enabled by               |
| --------------------- | -------------------------------- | ------------------------ |
| **Schema sync** (DDL) | Deployment-time job only         | `schema.sync: true`      |
| **Seed data**         | Deployment-time job (after sync) | `schema.seed: true`      |
| **Test seed data**    | Dev startup (after sync+seed)    | `schema.dbTest: true`    |
| **Handler binding**   | Every startup                    | Always (if tables exist) |

## Folder Structure

Every realm that owns database tables follows this pattern inside its `meta/` layer:

```
realmname/
├── meta/
│   ├── type/
│   │   └── schema.ts          # TypeBox TObject definitions (one per table) + constraints
│   ├── db/
│   │   ├── db.ts              # Handler that declares tables + procedure paths
│   │   ├── {name}Merge.yaml   # Production seed files (.db.asset)
│   │   └── schema/
│   │       └── {name}.sql     # Stored procedure files
│   └── dbTest/
│       └── {name}Merge.yaml   # Test seed files (.dbTest.asset)
├── error/
│   └── error.ts               # Optional: typed errors
└── adapter/
    └── db.ts                  # Optional: custom adapter extension (usually not needed)
```

The `meta/` folder is a **well-known layer** that is auto-discovered on both server and browser
platforms. It is activated by default — no `layer.server.ts` needed.

### How `imports` wiring works

The shared `blong-server/adapter/db.ts` imports handler groups matching regex patterns:

- **Always active** (`default` intent): `/\.db$/` — matches `meta/db/`
- **Dev only** (`dev` intent): also `/\.dbTest$/`, `/\.model$/`, `/\.fixture$/`
- **Microservice** (`microservice` intent): also `/\.model$/`, `/\.fixture$/`

The handler group name is constructed as `{realm}.{folder}`. For a realm `realmname`, the folder
`meta/db/` becomes handler group `realmname.meta.db`, which matches `/\.db$/`.

This means:

- **Production seeds** (YAML in `meta/db/`) are always loaded when the schema sync runs.
- **Test seeds** (YAML in `meta/dbTest/`) are only loaded in `dev` or `integration` mode.

---

## Step 1: Define TypeBox Schemas (`meta/type/schema.ts`)

Place a `schema()` factory export in `meta/type/schema.ts`. This file is the **single source of
truth** for table column definitions.

```typescript
// realmname/meta/type/schema.ts
import {schema} from '@feasibleone/blong';

export default schema(async ({lib: {type}}) => ({
    item: type.Object({
        itemId: type.increment(),
        itemName: type.stringNotNull({maxLength: 100}),
        itemDescription: type.stringNull(),
        itemPrice: type.numberNotNull(),
        itemActive: type.booleanNull(),
        createdAt: type.dateTimeNull(),
    }),
    category: type.Object({
        categoryId: type.increment(),
        categoryName: type.stringNotNull({maxLength: 50}),
    }),
}));
```

### ⚠️ Critical: Use convenience types, not raw TypeBox types

The `type` object provided by the framework (`schema(async ({lib: {type}}) => ({...}))`) contains
**convenience wrapper functions** that must be used instead of raw `Type.*()` calls. These wrappers
handle MySQL-specific column types, nullable/required semantics, and special default values
(auto-increment, ulid, uuid) correctly. **Never use raw `Type.String()`, `Type.Integer()`, or
`Type.Optional(T)` directly** — always use the convenience functions below.

The available convenience types are defined in `core/blong-lib/index.ts` and listed in the
`BlongType` interface in `core/blong/types.ts`:

| Convenience function     | SQL column type       | Nullable | Notes                                                                                                                          |
| ------------------------ | --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `type.increment()`       | `INT AUTO_INCREMENT`  | Yes      | Auto-generated PK. Returns `null` on insert, DB fills the value                                                                |
| `type.integerNotNull()`  | `INT`                 | No       | Required integer                                                                                                               |
| `type.integerNull()`     | `INT`                 | Yes      | Nullable integer                                                                                                               |
| `type.bigIntNotNull()`   | `BIGINT`              | No       | Required bigint (supports both BigInt & Int)                                                                                   |
| `type.bigIntNull()`      | `BIGINT`              | Yes      | Nullable bigint                                                                                                                |
| `type.stringNotNull()`   | `VARCHAR(N)` / `TEXT` | No       | Required string. Pass `{maxLength: N}` for `VARCHAR(N)` when N≤255, or for `TEXT` when N>255. Omit maxLength → `VARCHAR(255)`. |
| `type.stringNull()`      | `VARCHAR(N)` / `TEXT` | Yes      | Nullable string. Same maxLength rules as `stringNotNull`.                                                                      |
| `type.numberNotNull()`   | `DOUBLE`              | No       | Required decimal / float                                                                                                       |
| `type.numberNull()`      | `DOUBLE`              | Yes      | Nullable decimal / float                                                                                                       |
| `type.booleanNotNull()`  | `BOOLEAN`             | No       | Required boolean (also accepts `0`/`1`)                                                                                        |
| `type.booleanNull()`     | `BOOLEAN`             | Yes      | Nullable boolean                                                                                                               |
| `type.dateNotNull()`     | `DATE`                | No       | Required date (no time part)                                                                                                   |
| `type.dateNull()`        | `DATE`                | Yes      | Nullable date                                                                                                                  |
| `type.dateTimeNotNull()` | `DATETIME`            | No       | Required datetime                                                                                                              |
| `type.dateTimeNull()`    | `DATETIME`            | Yes      | Nullable datetime                                                                                                              |

### Primary key and foreign key type selection

Choosing the right identifier type is critical for correct behaviour:

| Type                                   | Purpose                         | Auto-generated             | Size     | Example use case                                                                                                                 |
| -------------------------------------- | ------------------------------- | -------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `type.increment()`                     | Auto-increment integer PK       | Yes, DB fills              | 4 bytes  | Simple standalone tables with no distributed ID needs                                                                            |
| `type.ulid()`                          | Time-sortable UUID PK           | Yes, framework fills       | 16 bytes | **Time-bound records**: transactions, audit logs, sessions, events — anything where chronological ordering matters               |
| `type.uuid()`                          | Random UUID PK                  | Yes, framework fills       | 16 bytes | **Inventory records**: currency, country, account, person, organization, products — anything with stable identity across systems |
| `type.uidNull()` / `type.uidNotNull()` | Foreign key (16-byte reference) | No, points to ulid/uuid PK | 16 bytes | **Foreign keys** that reference a `ulid` or `uuid` primary key in another table                                                  |

**Key rules:**

- **ULID** (`type.ulid()`) for primary keys of time-sensitive records where insert order matters
  (transactions, audit, sessions).
- **UUID** (`type.uuid()`) for primary keys of reference/entity records (currency, country, account,
  person, organization, products).
- **UID** (`type.uidNull()` / `type.uidNotNull()`) for foreign key columns that point to a `ulid` or
  `uuid` PK in another table. The name should describe the relationship (e.g., `userId`,
  `resourceId`, `accountId`).
- **INCREMENT** (`type.increment()`) for simple auto-increment integer PKs where distributed ID
  generation is not needed.
- Properties whose name ends in `Id` and use `type.increment()` are auto-detected as
  `AUTO_INCREMENT` primary key columns.
- Properties in the `required` array generate `NOT NULL` columns (`NotNull` suffixed types imply
  required, `Null` suffixed types imply optional).
- `type.Optional()` is **not needed** with convenience types — the `Null` suffix already implies
  null-ability.

### TypeBox → SQL type mapping (raw TypeBox equivalents)

Reference-only (you should not use the raw forms directly): `references/raw-typebox-mapping.md`.

### Structured JSON columns (`*JSON` suffix)

Any string column whose name ends in `JSON` is treated as a **JSON document** by the knex adapter
and is (de)serialized automatically — no manual `JSON.parse`/`JSON.stringify` in handlers:

- Declare it as a normal string column: `type.stringNull()` → `VARCHAR(255)` or specify size > 255
  for `TEXT`.
- On `insert`/`update`, object/array values for `*JSON` columns are `JSON.stringify`'d before
  hitting the database.
- On `select`/`first`, `*JSON` string values are `JSON.parse`'d back into objects (lenient — values
  that are not valid JSON are left untouched).

```typescript
credentialParamsJSON: type.stringNull(), // auto-(de)serialized by the adapter
```

The convention is **name-based** (`/JSON$/`) and applies to every QueryBuilder produced by the
shared `srv.db` knex adapter (see `blong-gogo/src/adapter/schema/knex/json.ts`), including direct
handler queries — you can `insert`/`select` an object into such a column as if it were a plain
value. This lets a realm store structured parameters in a single column; e.g.
`access_credential.credentialParamsJSON` holds `{"function":"hash","algorithm":"pbkdf2",...}` so
verification re-uses the exact parameters that produced the hash, and future non-hash credential
functions (TOTP, etc.) store their own params alongside the `function` name.

### Defining constraints

Constraints are declared via the **second argument** to `type.Object()`:

```typescript
type.Object(
    {
        itemId: type.increment(),
        itemName: type.stringNotNull(),
        categoryId: type.uidNotNull(), // FK → category PK which is a ulid/uuid
    },
    {
        constraints: {
            primaryKey: {columns: ['itemId', 'categoryId']}, // composite PK
            // — OR for single-column PK (auto-increment handled automatically):
            // primaryKey: 'itemId',

            unique: {
                itemName: {}, // unique index on itemName column
                // — OR with explicit columns:
                // fullName: {columns: ['firstName', 'lastName']},
            },

            foreign: {
                // For FK pointing to an increment PK, reference is `{table}.{column}`:
                categoryId: 'realmname.category.categoryId',
                // — OR with options:
                // categoryId: {
                //     references: 'realmname.category.categoryId',
                //     onDelete: 'CASCADE',
                //     onUpdate: 'RESTRICT',
                // },
            },

            index: {
                itemName: {}, // simple index
                // — OR with index type:
                // itemName: {indexType: 'FULLTEXT'},
            },
        },
    },
);
```

**Constraint reference:**

| Constraint   | Form                                                                   | Description                                           |
| ------------ | ---------------------------------------------------------------------- | ----------------------------------------------------- |
| `primaryKey` | `string` (single column) or `{columns, constraintName?}`               | Composite primary key                                 |
| `unique`     | `Record<string, {columns?}>`                                           | Unique constraint keyed by constraint name            |
| `foreign`    | `Record<string, string\|{references, columns?, onDelete?, onUpdate?}>` | Foreign key. `references` format: `{table}.{column}`  |
| `index`      | `Record<string, {columns?, indexType?}>`                               | Indexes. `indexType`: `'FULLTEXT'`, `'SPATIAL'`, etc. |

**Important:** Constraints are applied in a **second pass** after all tables exist. The framework
syncs tables first (pass 1, respecting `order`), then applies constraints (pass 2). This guarantees
that foreign-key target tables already exist. The operation is **idempotent** — already present
constraints are skipped.

### Referencing schemas across realms

When a realm's table references a schema from another realm (e.g., `access.user` referencing
`core.resource`), the adapter's `schema()` factory makes all schemas available via a shared
registry. The `objectSchema` parameter in `ready()` is populated by all `schema()` exports across
all loaded realms:

```typescript
// realmname/meta/type/schema.ts — using another realm's schema
export default schema(async ({lib: {type}}) => ({
    myEntity: type.Object(
        {
            myEntityId: type.uuid(), // PK — UUID for stable identity
            resourceId: type.uidNotNull(), // FK → core.resource (which uses uuid PK)
            entityName: type.stringNotNull(),
        },
        {
            constraints: {
                primaryKey: 'myEntityId',
                foreign: {
                    resourceId: 'core.resource.resourceId',
                },
            },
        },
    ),
}));
```

---

## Step 2: Declare Tables (`meta/db/db.ts`)

Create a `handler()` that exports a `config.schema.tables` map. Each key is a `{schema}.{table}`
name, and the value is its **creation order** — a number that determines the sequence in which
tables are created (lowest first), respecting foreign-key dependencies.

```typescript
// realmname/meta/db/db.ts
import {handler} from '@feasibleone/blong';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

const _schemaDir = join(dirname(fileURLToPath(import.meta.url)), 'schema');

export default handler(() => ({
    config: {
        schema: {
            tables: {
                // Format: '{schema}.{tableName}': order
                // Tables with lower order numbers are created first.
                'realmname.category': 1, // Created first (no FK dependencies)
                'realmname.item': 2, // Created second (may FK to category)

                // If your table name contains dots, they become underscores in SQL:
                // e.g. 'core.resource' → SQL table name `core_resource`
            },
            // Optional: folder with .sql stored procedure files
            procedurePaths: [_schemaDir],
        },
    },
}));
```

### Table naming

The key format `{schema}.{table}` maps to SQL table name `{schema}_{table}`. For example:

| Config key         | SQL table name   |
| ------------------ | ---------------- |
| `'realmname.item'` | `realmname_item` |
| `'core.resource'`  | `core_resource`  |

The dot is replaced with an underscore automatically to create the physical table name. The TypeBox
schema lookup uses the original dotted name as the key into `objectSchema`.

### Override options

Instead of a plain number, use `ISchemaTable` for more options:

```typescript
tables: {
    'realmname.item': {
        definition: schema.realmname.item,  // Explicit TypeBox reference
        order: 2,                          // Creation order
        dropColumns: true,                  // Allow dropping removed schema columns
    },
},
```

You usually do not need the `definition` field when the schema name matches — the adapter
automatically resolves it from the shared `objectSchema` registry. Use it when the TypeBox
definition key differs from the table config key.

---

## Step 3: Add Production Seeds (`meta/db/*.yaml`)

Place YAML files in `meta/db/`. Each file seeds data via the `merge` pattern — the filename
determines which handler method is called.

### ⚠️ Seed data is always YAML — never TypeScript

Seed data **must** be placed in YAML (`.yaml`) files. TypeScript handler files should only contain
**custom merge logic** (see Case 3 below). This separation keeps seed data declarative and easy to
maintain. The framework's Watch mechanism auto-wraps YAML files as asset modules — no additional
registration is needed.

### File naming convention

The method name is derived from the filename: the part after the **last `-`** (without extension).
The params object is the YAML content.

```
0-coreTypeMerge.yaml       → method: coreTypeMerge
accessRoleMerge.yaml       → method: accessRoleMerge
marineCoralMerge.yaml      → method: marineCoralMerge
```

The numeric prefix (`0-`) is optional and controls sort order during seed processing (files are
processed in alphabetical order by full filename, so `0-*` sorts before `a-*`).

### How seeds work

The adapter's `ready()` hook calls `processSeedAssets(ctx, /\.db\.asset$/)` when `schema.seed` is
`true`. This iterates over all asset modules matching the regex — any `.yaml`/`.yml`/`.json` file in
a handler folder that the Watch mechanism wraps as an asset module. Each file is read, parsed, and
dispatched as a method call against the adapter's handle function.

The method name = `basename(filename).split('-').pop()` (the part after the last `-`).

### Three main seed patterns

There are three common patterns for seeding data, depending on how the target table is managed.

---

#### Case 1: Independent table (built-in merge)

For a standalone table that has its own auto-bound CRUD handlers via the `namespace` config, the
built-in `{ns}{Table}Merge` handler handles merge/upsert automatically. The seed file sends data
directly to the table's merge handler.

The optional `key` property specifies the merge key (defaults to `${object}Id`).

```yaml
# realmname/meta/db/realmnameItemMerge.yaml
key: itemCode
item:
    - itemCode: WDG-001
      itemName: Widget A
      unitPrice: 10.00
      isActive: true
    - itemCode: GDT-002
      itemName: Gadget B
      unitPrice: 20.00
      isActive: true
```

This dispatches to `dbItemMerge({key: 'itemCode', item: [...]}, {method: 'realmnameItemMerge'})`.

The built-in merge uses `INSERT ... ON CONFLICT ... MERGE` — insert if new, update if exists.

---

#### Case 2: `core.resource`-based tables (with `resourceType`)

Many tables in the framework are linked to `core.resource` via a foreign key — the entity's PK is
also a resourceId in `core_resource`. For these tables, the seed must specify a `resourceType` value
that matches the type alias registered for this entity.

**Every entity row must include a `name` property** — this is the mandatory merge key that maps to
`core_resource.resourceName`. The merge handler looks up existing records by name to determine
whether to insert or skip (idempotent merge). Without `name`, the merge cannot deduplicate.

```yaml
# realmname/meta/db/0-realmnameTypeMerge.yaml
resourceType: realmname.myEntity
myEntity:
    - name: Widget # ← `name` maps to core_resource.resourceName
      description: A basic widget
    - name: Gadget
      description: An advanced gadget
```

This dispatches to
`{handlerMethod}({resourceType: 'realmname.myEntity', myEntity: [...]}, {method: 'realmnameTypeMerge'})`.

The handler is expected to:

1. Look up (or create) the `core.type` entry for `realmname.myEntity`
2. Check `core_resource.resourceName` for each entity's `name` — skip if exists
3. For new entities: generate a UUID resourceId, insert into `core_resource`, insert into the
   entity-specific table using that resourceId as PK

```yaml
# realmname/meta/db/realmnameRoleMerge.yaml
resourceType: realmname.role
role:
    - name: Admin # ← `name` is the merge key
      roleBit: 0
      description: Full system access
    - name: User
      roleBit: 1
      description: Standard user access
```

---

#### Case 3: Custom merge handler (most flexible)

For complex seeding that spans multiple tables or needs custom logic (e.g., creating users with
credentials and role assignments in one step), write a **custom TypeScript handler** in the
`adapter/db/` layer and reference entities by their logical **names** rather than raw IDs.

The YAML seed file references entities by name, and the custom handler resolves names to IDs:

```yaml
# realmname/meta/dbTest/realmnameAuthorizationMerge.yaml
user:
    testUser:
        password: testPassword
        roles: Admin
    testAdmin:
        password: testPassword
        roles: Admin
    testViewer:
        password: testPassword
        roles: Customer
role:
    Admin: testManagement
capability:
    testManagement: accessTestPrivate
```

The custom handler (`adapter/db/realmnameAuthorizationMerge.ts`) receives this YAML content as its
params and resolves names to IDs via database lookups:

```typescript
// realmname/adapter/db/realmnameAuthorizationMerge.ts
import {handler} from '@feasibleone/blong';

export default handler(
    () =>
        async function realmnameAuthorizationMerge(
            params: {
                user?: Record<string, {password?: string; roles?: string}>;
                role?: Record<string, string>;
                capability?: Record<string, string>;
            },
            $meta: Record<string, unknown>,
        ): Promise<{success: boolean}> {
            // 1. Process capabilities → resolve action names to IDs
            // 2. Process roles → resolve capability names, create role bindings
            // 3. Process users → create credentials, assign roles by name
            // 4. Refresh materialized paths
            return {success: true};
        },
);
```

See `core/blong-access/adapter/db/accessAuthorizationMerge.ts` for a complete reference
implementation — it handles capabilities (actions), roles with capability bindings, and users with
password credentials in a single handler.

The key advantage of this pattern is that seed data references entities by their **names** (e.g.,
`roles: Admin`, `capability: testManagement`) rather than hardcoded database IDs, making seeds
readable and maintainable.

---

## Step 4: Add Test Seeds (`meta/dbTest/*.yaml`)

Test seeds follow the same pattern as production seeds but are placed in `meta/dbTest/`. They
**must** also be YAML — never TypeScript. The same three seed patterns (independent table,
`core.resource`-based, custom merge handler) apply to test seeds as well.

They are processed **only** when both `schema.seed: true` AND `schema.dbTest: true` are set in the
adapter config. In practice, this happens in the `dev` intent.

```yaml
# realmname/meta/dbTest/realmnameEntityMerge.yaml
myEntity:
    testWidget:
        entityName: Test Widget
        isActive: true
    testGadget:
        entityName: Test Gadget
        isActive: false
role:
    tester: realmname.testAccess
```

Test seeds typically create test users, test roles, test permissions, or other data needed by
automated tests but not appropriate for production.

### Seed vs test seed separation

| Aspect          | Production seeds (`meta/db/`)   | Test seeds (`meta/dbTest/`)                 |
| --------------- | ------------------------------- | ------------------------------------------- |
| Location        | `meta/db/*.yaml`                | `meta/dbTest/*.yaml`                        |
| Asset pattern   | `.db.asset`                     | `.dbTest.asset`                             |
| Enabled by      | `schema.seed: true`             | `schema.seed: true` + `schema.dbTest: true` |
| Loaded in       | `dev`, `upgrade`, `integration` | `dev` only                                  |
| Typical content | Type aliases, reference data    | Test users, test fixtures                   |

---

## Step 5: Create Stored Procedures (`meta/db/schema/*.sql`)

Place each stored procedure in its own `.sql` file. The file's base name becomes the procedure name.

```sql
-- realmname/meta/db/schema/realmname_item_list_active.sql
CREATE PROCEDURE `realmname_item_list_active`()
BEGIN
    SELECT * FROM `realmname_item` WHERE `itemActive` = 1;
END
```

### How procedure sync works

- The adapter compares the procedure body against `information_schema.ROUTINES.ROUTINE_DEFINITION`.
- Procedures are only re-created when the body differs (normalised for whitespace and comments).
- Repeated runs with an unchanged schema produce zero SQL — safe to run multiple times.

### Private procedures

Prefix the file name with `_` to mark it as a private DB helper:

```sql
-- realmname/meta/db/schema/_my_helper.sql
CREATE PROCEDURE `_my_helper`()
BEGIN
    -- helper logic, not exposed as API handler
END
```

Private procedures are synced to the database but **not** bound as synthetic API handlers.

### Auto-bound synthetic handlers

After `ready()`, every non-private procedure is callable as a synthetic handler via both its
camelCase name (for `super` calls) and its methodId (for framework dispatch):

| SQL procedure name           | camelCase (for super)     | methodId (for dispatch)   |
| ---------------------------- | ------------------------- | ------------------------- |
| `realmname_item_list_active` | `realmnameItemListActive` | `realmnameitemlistactive` |

```typescript
// Called from any orchestrator or test:
const rows = await handler.realmnameItemListActive({}, $meta);
```

Input parameters map from camelCase keys matching the procedure's `IN`/`INOUT` parameters.

---

## Step 6: Wire It Up via Adapter Config

The shared `blong-server/adapter/db.ts` is already configured with the `adapter.knex` base and the
appropriate `imports` patterns. You generally do **not** need to create or modify it.

**Key config in `blong-server/adapter/db.ts`:**

```typescript
// Built-in (already exists — do not recreate):
export default adapter<{...}>(() => ({
    extends: 'adapter.knex',
    activation: {
        default: {
            imports: [/\.db$/],         // picks up meta/db/ handlers
            namespace: 'db',
        },
        dev: {
            imports: [/\.db$/, /\.dbTest$/, /\.model$/, /\.fixture$/],
            schema: {
                sync: true,             // run DDL
                seed: true,             // process .db.asset seeds
                dbTest: true,           // process .dbTest.asset seeds
                dropColumns: true,      // allow dropping removed columns
            },
        },
        upgrade: {
            schema: {sync: true, seed: true},
        },
        microservice: {
            imports: [/\.db$/, /\.model$/, /\.fixture$/],
        },
    },
}));
```

The database name resolves from `${suite}` (the suite name) or, in dev mode, from a combination of
suite name and user name:

```text
dev:   ${[suite, user].map(s => s.toLowerCase().replace(/[^a-z0-9-]/g, "_")).join("-")}
       → e.g. "blong-access-kalin"
other: ${suite}
       → e.g. "blong-access"
```

---

## Execution Order (Complete Lifecycle)

When `blong` runs with the `dev` intent (or `upgrade`), the framework processes schema in this exact
order:

```
1. Connect to database (Knex pool established)
2. For each realm (sorted by package dependency order):
   a. Create/alter tables (pass 1)         ← schemaTableSyncImpl
      - Tables created in ascending `order`
      - New columns added to existing tables
      - Columns dropped only if `dropColumns: true`
   b. Apply constraints (pass 2)           ← schemaTableConstraintSyncImpl
      - Composite primary keys
      - Unique constraints
      - Indexes
      - Foreign keys
   c. Sync stored procedures               ← schemaProcedureSyncImpl
      - Only re-created when body differs
      - Private (`_`-prefixed) procedures synced but not exposed
3. Bind procedure handlers                 ← bindSyntheticHandlers
   - All non-private procedures become callable
4. Process production seeds                ← processSeedAssets(ctx, /\.db\.asset$/)
   - Reads YAML/JSON files from meta/db/
   - Dispatches each as a method call
5. Process test seeds (if dbTest enabled)  ← processSeedAssets(ctx, /\.dbTest\.asset$/)
   - Reads YAML/JSON files from meta/dbTest/
   - Dispatches each as a method call
6. Start serving API requests
```

### Intent-specific behaviour

| Intent                | `schema.sync` | `schema.seed` | `schema.dbTest` |
| --------------------- | ------------- | ------------- | --------------- |
| `dev`                 | ✅            | ✅            | ✅              |
| `integration`         | ✅            | ✅            | ✅              |
| `upgrade`             | ✅            | ✅            | ❌              |
| `microservice`        | ❌            | ❌            | ❌              |
| `default` (no intent) | ❌            | ❌            | ❌              |

---

## Auto-bound CRUD Handlers

When `namespace` is set on the adapter (default: `'db'`), the framework generates six CRUD handler
functions for every declared table. These are stored as synthetic own-property handlers on the
adapter object — **no handler files needed**:

| Handler | Pattern               | Example        |
| ------- | --------------------- | -------------- |
| Get     | `${ns}${Table}Get`    | `dbItemGet`    |
| Find    | `${ns}${Table}Find`   | `dbItemFind`   |
| Add     | `${ns}${Table}Add`    | `dbItemAdd`    |
| Edit    | `${ns}${Table}Edit`   | `dbItemEdit`   |
| Remove  | `${ns}${Table}Remove` | `dbItemRemove` |
| Merge   | `${ns}${Table}Merge`  | `dbItemMerge`  |

Call them from any orchestrator or test by listing them in the `handler: {}` proxy:

```typescript
handler: {
    (dbItemAdd, dbItemFind, dbItemRemove);
}
```

### Overriding auto-bound CRUD

To override a synthetic handler (e.g., to add custom logic before/after the default), create a
handler file in the adapter layer with the matching name. The realm handler takes precedence over
the synthetic one:

```typescript
// realmname/adapter/db/dbItemAdd.ts
import {handler} from '@feasibleone/blong';

export default handler(
    () => ({
        async dbItemAdd(params, $meta) {
            // Custom pre-processing
            const result = await (super as unknown as Record<
                string,
                (p: object, m: object) => Promise<unknown>
            >).dbItemAdd(params, $meta);
            // Custom post-processing
            return result;
        },
    }),
);
```

The `super` key uses the **camelCase** name (`dbItemAdd`), not the methodId lowercase form.

---

## Constraint Sync (Two-Pass Architecture)

Constraints are applied separately from columns, in a **second pass** after all tables exist. This
ensures foreign-key target tables are guaranteed to exist when the FK is created.

### What gets synced

| Constraint type       | Source in TypeBox                 | SQL                                       |
| --------------------- | --------------------------------- | ----------------------------------------- |
| Composite primary key | `constraints.primaryKey`          | `PRIMARY KEY (col1, col2)`                |
| Single-column PK      | Auto-detected (`*Id` + `Integer`) | `AUTO_INCREMENT PRIMARY KEY`              |
| Unique                | `constraints.unique`              | `UNIQUE (col1, col2)`                     |
| Foreign key           | `constraints.foreign`             | `FOREIGN KEY (col) REFERENCES table(col)` |
| Index                 | `constraints.index`               | `INDEX name (col1, col2)`                 |

### Idempotency

The constraint sync checks `information_schema.TABLE_CONSTRAINTS` and
`information_schema.STATISTICS` to skip already-present constraints. Running the sync multiple times
on an unchanged schema produces no SQL.

---

## Explicit Schema Helper Methods

The adapter also exposes schema operations as callable handler methods for explicit imperative
control (e.g., integration test cleanup):

| Handler                 | Description                                     |
| ----------------------- | ----------------------------------------------- |
| `dbSchemaTableSync`     | Create or alter a specific table                |
| `dbSchemaTableDrop`     | Drop a specific table                           |
| `dbSchemaProcedureSync` | Create/replace stored procedures                |
| `dbSchemaProcedureBind` | Discover procedures and return handler closures |

For normal development, the declarative config path (`schema.tables`, `procedurePaths`) is preferred
over these helpers.

---

## Common Patterns

### Adding a new table to an existing realm

1. Add the TypeBox definition to `meta/type/schema.ts`
2. Add the table entry to `meta/db/db.ts` with an appropriate order number
3. Create seed YAML in `meta/db/` (if production data needed)
4. Create test seed YAML in `meta/dbTest/` (if test data needed)
5. Add any stored procedures in `meta/db/schema/`

### Adding a constraint to an existing table

1. Add `constraints` to the `type.Object()` options in `meta/type/schema.ts`
2. No changes needed in `meta/db/db.ts` — the constraint is picked up automatically
3. On next sync, the constraint is applied idempotently

### Referencing another realm's table

When your table has a foreign key to another realm's table (e.g., to `core.resource`), you just
declare the FK in your constraint. The target table must exist in the same database. Since `core` is
a dependency of most realms, its tables are created first.

```typescript
// realmname/meta/type/schema.ts
type.Object(
    {
        myEntityId: type.uuid(), // PK — UUID for stable cross-system identity
        resourceId: type.uidNotNull(), // FK → core.resource (which uses uuid PK)
        entityName: type.stringNotNull(),
    },
    {
        constraints: {
            primaryKey: 'myEntityId',
            foreign: {
                resourceId: 'core.resource.resourceId',
            },
        },
    },
);
```

### Creating a schema-only realm (no adapter handlers)

Some realms only need to contribute tables and seeds without defining their own adapter handlers. In
that case, you still create the `meta/db/db.ts` and `meta/type/schema.ts` files. The `blong-server`
adapter will pick them up via the `imports` pattern automatically.

---

## Extending the Schema System

The declarative schema system is designed to be extended when new use cases appear. The skill is
allowed to evolve and improve upon the approach. Key extension points in the framework:

| Extension point                 | Location                                                 | What it does                                                                                                      |
| ------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `knex.ts` `ready()` hook        | `core/blong-gogo/src/adapter/server/knex.ts`             | Lifecycle that processes schema sync, seeds, test seeds, handler binding. Add new phases here.                    |
| `processSeedAssets()`           | `core/blong-gogo/src/adapter/server/knex.ts`             | Processes YAML/JSON seed files as method calls. Can be extended to support new file formats or dispatch patterns. |
| `schemaTableSyncImpl`           | `core/blong-gogo/src/adapter/schema/knex/schemaTable.ts` | Creates/alters tables. Can be extended to support new column types or table options.                              |
| `schemaTableConstraintSyncImpl` | `core/blong-gogo/src/adapter/schema/knex/schemaTable.ts` | Applies constraints. Can be extended to support new constraint types.                                             |
| `schemaProcedureSyncImpl`       | `core/blong-gogo/src/adapter/schema/knex/schemaMysql.ts` | Syncs stored procedures. Can be extended for other DB object types.                                               |
| `IConfig` schema interface      | `core/blong-gogo/src/adapter/schema/knex/types.ts`       | Config fields for `schema` block. Add new fields here.                                                            |

When the skill encounters a use case not covered by the existing patterns (e.g., a new seed dispatch
target, a new constraint type, a new file format reference), it should:

1. Implement the change in the appropriate extension point
2. Document the new pattern in this skill
3. Update the schema-sync docs (`docs/blong/docs/patterns/schema-sync.md`)
