# @feasibleone/blong-core

Core utility realm — provides the reusable **resource graph** database schemas: `resource`, `type`,
`property`, `triple`, `translation`, and `path`. This is the foundation that resource-based realms
(such as `@feasibleone/blong-party` and `@feasibleone/blong-access`) are built on.

`blong-core` is **almost** schema-only: it declares the tables, their creation order and the initial
`core.type` aliases, and CRUD for those tables is auto-provided by the runtime (the knex adapter)
rather than by handler files. The two exceptions are the graph's own guarantees, which cannot be a
generic insert — `core.resource.ensure` (find-or-create a resource by type and name, healing a
resource whose entity row is missing) and `core.triple.merge` (insert edges idempotently and refresh
the materialized paths). Both live in `adapter/db/`; there are no orchestrators.

## Data model

| Table              | Purpose                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `core.resource`    | Universal entity registry — `resourceId` (UUID), `resourceName` (stable, indexed lookup key), `typeId` → `core.type`. |
| `core.type`        | Type discriminator catalog — `typeId` (auto-increment), unique `typeAlias` (e.g. `party.person`, `access.role`).      |
| `core.property`    | Generic key/value attributes per resource — `(resourceId, propertyName, propertyValue)`.                              |
| `core.triple`      | The relationship graph — `(subjectId, predicateName, objectId)`, both endpoints FK to `core.resource`.                |
| `core.translation` | i18n display names per resource — `(resourceId, languageCode, translatedName)`.                                       |
| `core.path`        | Materialized reachability — `(originId, destinationId, pathType, pathDepth)`, precomputed for fast graph lookups.     |

The physical SQL tables are named `core_resource`, `core_type`, etc. (the dot in `core.resource`
becomes an underscore). Initial type aliases are seeded via `meta/db/coreTypeMerge.yaml`
(`core.currency`, `core.language`, `core.country`, `core.city`). The seed's _method name_ is the
part after the last `-` in the filename, so the leading number other realms use (`0-`) is a
convention for reading order, not something the loader needs.

## Usage

Include the realm as a child in your suite's server entry:

```ts
// index.ts / server.ts
children: [
    async function srv() {
        return import('@feasibleone/blong-server/server.ts');
    },
    async function core() {
        return import('@feasibleone/blong-core/server.ts');
    },
    // ... your realms
],
```

`@feasibleone/blong-core` also ships its own `index.ts` suite entry (wiring `blong-server` +
`blong-login` + core) for running the schema standalone.

## Runtime behaviors

Framework behaviors in the knex adapter make the resource graph work automatically — do not
reimplement them:

1. **`add` on a resource-backed table auto-creates the `core_resource` row.** When a primary key
   column uses `type.uuid()` _and_ its foreign key is `core.resource.resourceId`, the runtime
   generates a UUID, resolves the `core.type` alias (`${subject}.${object}`), and inserts both the
   `core_resource` row and the entity row.
2. **`merge` with a `resourceType` param resolves/creates `core_resource` rows by `name`.** Each
   row's `name` maps to `core_resource.resourceName`, and `(typeAlias, resourceName)` is the key
   `merge` and `core.resource.ensure` look up. It is a logical identity rather than a unique
   constraint — `resourceName` is indexed, not unique — so identity holds while writes go through
   `merge`/`ensure`, and a plain `add` with no name mints a resource named after the column.
3. **`*JSON` columns are auto-(de)serialized.** Any column whose name ends in `JSON` (declared as
   `type.stringNull()`) is stored/retrieved as JSON automatically: object/array values are
   `JSON.stringify`'d on write and parsed back on read — no manual `JSON.parse`/`stringify` in
   handlers (see `blong-gogo/src/adapter/schema/knex/json.ts`). Example:
   `access_credential.credentialParamsJSON`.

This means there is **no** `resourceResourceAdd`-style handler — CRUD for core-backed tables is
auto-bound. Extend the graph by defining schema and seeds, not handlers.

## Extending

- **Add a new core-level entity** (rare): add a `type.Object` to `meta/type/schema.ts` and register
  the table in `meta/db/db.ts` with an order number.
- **Build a resource-based realm on top of core** (common): define an entity whose PK is a
  `type.uuid()` FK to `core.resource.resourceId`, register the table with an order **greater than
  core's** (order 1), seed the type alias in a `0-*TypeMerge.yaml`, and seed instances with
  `resourceType` + `name`. See `@feasibleone/blong-party` and `@feasibleone/blong-access` for the
  canonical examples.

## References

- [blong-core skill](../../.github/skills/blong-core/SKILL.md) — extending/utilizing the core,
  party, and access realms
- [blong-schema skill](../../.github/skills/blong-schema/SKILL.md) — declarative schema management
- [meta pattern docs](../../docs/blong/docs/patterns/meta.md)
