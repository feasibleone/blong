# Declarative Schema Management (knex adapter)

The built-in `adapter.knex` includes a **declarative schema management** feature that lets a realm
declare its database tables, constraints, stored procedures, and seed data as plain TypeScript and
YAML configuration.  There are no migration files, no separate tooling, and no manual SQL.

The feature has three concerns that happen at different times:

## Schema sync (deployment time only)

When `schema.sync` is enabled the adapter reconciles the database structure against the declared
configuration.  This is intended to run only during deployment — typically as a dedicated
short-lived job — **not** on every normal application startup:

1. **Creates or alters tables** from [TypeBox](https://github.com/sinclairzx81/typebox) `TObject`
   schemas — new tables are created; new columns in existing tables are added; columns can
   optionally be dropped when removed from the schema.
2. **Applies table constraints** (composite primary keys, unique constraints, foreign keys,
   indexes) in a second pass after all tables exist.  Constraints are declared via the `constraints`
   property on the `type.Object()` options.  The sync is idempotent — already-present constraints
   are skipped.
3. **Creates stored procedures** from `.sql` source files discovered in configured folders
   (or from inline SQL strings for backward compatibility).  Procedures are only re-created when
   their body differs from what is already in the database, so repeated runs are cheap.

## Seed data (deployment time only, after sync)

When `schema.seed` is enabled, the adapter processes **production seed data** from YAML/JSON files
in the `meta/db/` folder.  When `schema.dbTest` is also enabled (typically in `dev` intent), it
additionally processes **test seed data** from `meta/dbTest/` folder.  Seeds are dispatched as
method calls against the adapter's handler dispatch, so they go through the same validation and
business logic as normal API calls.

## Handler binding (every startup)

Regardless of `schema.sync`, on every adapter startup:

1. **Binds synthetic handlers** for every stored procedure found in the database — no handler file
   needed.  Procedures are called through the standard framework dispatch mechanism by their
   camelCase name (e.g. `sqlItemListActive`).
2. **Auto-binds CRUD handlers** for every declared table when a `namespace` is configured.
   The generated handlers (`${namespace}${Table}Get`, `Find`, `Add`, `Edit`, `Remove`, `Merge`)
   are reachable via normal dispatch without any handler files.

Procedures whose SQL name starts with `_` are treated as **private** DB helpers: they are synced
to the database but **not** bound as API handlers.

See the [pattern guide](../patterns/schema-sync.md) for full configuration examples, the TypeBox →
SQL type mapping table, constraint declaration patterns, seed data conventions, and override
patterns.  See the [rationale](../rationale/schema-sync.md) for why this approach was chosen over
migration-file alternatives.
