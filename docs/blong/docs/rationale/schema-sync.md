# Rationale: Declarative Schema Management

## The problem

Every application that uses a SQL database has to bridge two worlds: the strongly-typed code world
and the relational schema world.  Traditional approaches create friction at that boundary.

**Migration files** (Flyway, Liquibase, TypeORM migrations, Knex migrations) solve schema evolution
but at a cost:

- A separate file must be created for every schema change, even trivial column additions.
- The history of all past migrations must be kept in source control forever.
- Running migrations is a separate deployment step that must be coordinated with application rollout.
- In a monorepo with multiple realms, each realm owns its migration history independently, but they
  all land in the same database — ordering conflicts are possible.
- Writing tests that exercise the full schema lifecycle is cumbersome because the test must manage
  migration state explicitly.

**Raw SQL files** committed to the repo sidestep migration history but leave the developer
responsible for detecting drift between the current state and the desired state.

## The solution: declare, don't migrate

The `adapter.knex` schema feature takes a different approach: **the TypeBox schema is the single
source of truth**.  A dedicated deployment job (with `schema.sync: true`) compares the desired
state (declared in config) against the actual database state and reconciles the difference.
Normal application instances never run DDL — they only bind synthetic handlers at startup.
The developer never writes `CREATE TABLE` or `ALTER TABLE` SQL — they only maintain a TypeBox
object definition.

This approach has several advantages:

### 1. The schema stays co-located with the code that uses it

The TypeBox definition lives in the adapter layer next to the handlers that read from and write to
the table.  When a handler changes its expected return shape, the schema file changes too — in the
same commit, in the same code review, for the same business reason.

```text
mysql/adapter/sql/
├── schemaItemSchema.ts    ← single source of truth for the table shape
├── sqlSchemaItemAdd.ts    ← uses schemaItemSchema (optional override)
└── schema/
    └── sql_schema_list_active.sql
```

### 2. Multiple realms can contribute tables to the same database

Because each realm declares its own tables independently, a suite composed of multiple realms
naturally builds up the full database schema from its parts.  There is no central migration
registry to update — the adapter's `ready()` hook handles each realm's tables idempotently.

This makes it straightforward to assemble applications from independently-versioned packages.  A
`blong-login` realm contributes its `user` and `session` tables; a `payment` realm contributes its
`transaction` table; both land in the same database without coordination overhead.

### 3. The database looks like a normal async function call

When a stored procedure is created from a `.sql` file, the adapter automatically discovers it and
wires it as a **synthetic handler** — callable through normal framework dispatch with a camelCase
name, the same way every other handler is called:

```typescript
const activeItems = await handler.sqlSchemaListActive({}, $meta);
```

From the calling code's perspective there is nothing special about this call.  The same mechanism
that routes `userUserAdd` to a TypeScript handler file routes `sqlSchemaListActive` to the stored
procedure in the database.  This means:

- **Mocking is trivial** — in a test that should not hit the database, the test layer registers a
  mock handler named `sqlSchemaListActive` and the framework routes to it instead.
- **Swapping the implementation** is a configuration change — replace the SQL procedure with a
  TypeScript handler file of the same name and the callers need not change.
- **The vocabulary is consistent** — `sql.schema.listActive` is the method name in logs, API
  docs, and test assertions whether the underlying implementation is a stored procedure or a
  TypeScript function.

### 4. Auto-bound CRUD removes boilerplate for common operations

Setting `namespace: 'sql'` and declaring a table automatically generates six standard CRUD
handlers (`Get`, `Find`, `Add`, `Edit`, `Remove`, `Merge`) without any handler files.  This
satisfies the RAD principle: the default gives you everything for a straightforward table, and
you override only the operations that need custom logic.

The override mechanism is natural: a handler file with the matching name (`sqlSchemaItemAdd.ts`)
takes precedence over the synthetic handler, and can delegate back to the generated version via
`super.sqlSchemaItemAdd(params, $meta)` if it only needs to wrap or extend the default behaviour.

### 5. Diff-only procedure sync avoids unnecessary work

Stored procedures are only `DROP`ped and re-`CREATE`d when the new procedure body differs from
what is already in the database (normalised for whitespace and comments).  This means the
deployment job can be run safely multiple times (e.g. during a rolling deploy) without producing
spurious DDL on each invocation.

## Why not ORM?

ORMs (TypeORM, Prisma, Drizzle) solve some of the same problems but introduce their own coupling:

- The application code becomes dependent on the ORM's query builder and lifecycle hooks.
- Switching from one ORM to another (or to raw SQL) requires rewriting all data-access code.
- ORMs often have opinions about handler structure, naming, and transaction management that
  conflict with the Blong handler-first model.

The `adapter.knex` approach uses Knex only as a query builder and thin SQL abstraction.  The
business logic handlers call the database via the framework's method dispatch — not via a
shared ORM instance.  The schema management layer is a small, replaceable addition on top.

## Why not store procedures for everything?

Stored procedures make sense for:

- Complex queries that benefit from database-side optimisation
- Operations that must be atomic at the DB level without application-level transactions
- Reusable logic shared across multiple application processes

But they are harder to test, version, and refactor than TypeScript code.  The framework therefore
supports a **gradual spectrum**: start with auto-bound CRUD (no SQL at all), add `.sql` procedure
files for complex queries, and override with TypeScript handlers when the logic outgrows a
procedure.  The calling code does not change — only the backing implementation.
