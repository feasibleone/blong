# @feasibleone/blong-party

Party management realm — persons, organizations, org units, plus their contacts, addresses, and
identifiers. Persons, organizations, and units are **resources**: their primary keys are foreign
keys to `core.resource.resourceId`, so every party is a first-class, referenceable entity in the
resource graph. Party is a real-DB realm (no mocks) — CRUD runs against MySQL through the knex
adapter.

## Data model

| Table | PK | Notes |
| ----- | -- | ----- |
| `party.person` | `personId` → `core.resource.resourceId` | firstName / middleName / lastName / birthDate / gender / maritalStatus / nationality / occupation |
| `party.organization` | `organizationId` → `core.resource.resourceId` | legalName / tradingName / registrationNumber / taxId / industry / website |
| `party.unit` | `unitId` → `core.resource.resourceId` | unitName / unitType (department, branch, division, team) |
| `party.contact` | `partyContactId` (increment) | FK `partyResourceId` → `core.resource.resourceId`; contactType + contactValue + isPrimary |
| `party.address` | `partyAddressId` (increment) | FK `partyResourceId`; addressType / streetAddress / city / stateProvince / postalCode / countryId |
| `party.identifier` | `partyIdentifierId` (increment) | FK `partyResourceId`; identifierType / value / issuingAuthority / dates |

Party tables are registered with order numbers 300–305 so `core.*` tables (order 1) exist first.
Type aliases (`party.person`, `party.organization`, `party.unit`) are seeded via
`meta/db/0-coreTypeMerge.yaml`; test data lives in `meta/dbTest/*Merge.yaml` (loaded in
`dev`/`integration` when `schema.dbTest: true`).

## Hierarchy lives in the graph

Party has **no** `organizationId` / `parentUnitId` columns and no member join tables. All hierarchy
and membership is stored as `core.triple` edges:

| Predicate | Edge | Meaning |
| --------- | ---- | ------- |
| `belongsTo` | `unit → organization` | the unit belongs to an organization |
| `belongsTo` | `person → unit` | the person is a member of the unit |
| `isPartOf` | `unit → parentUnit` | tree hierarchy (child under parent) |

Storing hierarchy in the graph is deliberate: `blong-access` traverses the same `belongsTo`
predicate for RBAC inheritance (`user → unit → role → capability → action`).

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
    async function party() {
        return import('@feasibleone/blong-party/server.ts');
    },
    // ...
],
```

And on the browser side for the model-driven UI:

```ts
// browser.ts
children: [
    async function ui() {
        return import('@feasibleone/blong-browser/browser.ts');
    },
    async function party() {
        return import('@feasibleone/blong-party/browser.ts');
    },
    // ...
],
```

`blong-party` also doubles as a standalone suite — `index.ts` (server) wires `blong-server` +
`blong-login` + `blong-core` + `blong-access` + party and registers the model validation schemas via
`srv.subject.validation.mock`; `index.browser.ts` is the matching browser entry.

## Models

The realm ships browser models that drive the model system's Browse/New/Open pages:

- `partyPersonModel` — person profiles with contact / address / identifier cards
- `partyOrganizationModel` — organization profiles
- `partyUnitModel` — org units

Models are auto-discovered from `meta/model/` on the browser platform.

## CRUD

Basic CRUD is auto-provided by the runtime: `party.person.add/find/get/edit/remove/merge` (and the
same for `organization` and `unit`). The `add` operation auto-creates the `core_resource` row;
`merge` with `resourceType` + `name` seeds idempotently. No handler files are needed for basic
operations.

## Extending

- **New party type** (e.g. `party.vendor`): add an entity with PK = `type.uuid()` + FK to
  `core.resource.resourceId`, register the table (order > 300), seed the alias in
  `0-coreTypeMerge.yaml`, seed instances with `resourceType` + `name`, and add a matching browser
  model.
- **New sub-entity** (like contact/address/identifier): a plain table with an increment PK and an FK
  column (`partyResourceId`) to `core.resource.resourceId` — attached to a party resource, not a
  resource itself.

## Testing

Playwright E2E tests cover the party CRUD flows against the live dev server (real MySQL):

```bash
npm run ci-test    # waits for MySQL, then runs blong-dev playwright --coverage
npm run playwright # interactive Playwright run
```

## References

- [blong-core skill](../../.github/skills/blong-core/SKILL.md) — extending/utilizing the core, party, and access realms
- [blong-model skill](../../.github/skills/blong-model/SKILL.md) — browser CRUD pages from model specs
- [blong-schema skill](../../.github/skills/blong-schema/SKILL.md) — declarative schema management
