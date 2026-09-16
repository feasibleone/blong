# ACL pattern

Putting the record-level ACL on a table, writing rules and verifying them. The `blong-access` README
documents the rule table and the ACL pages; the [ACL concept](../concepts/acl.md) describes the
model and the [rationale](../rationale/acl.md) explains the decisions.

## 1. Opt a table in

```ts
// realm/<realm>/meta/db/db.ts
'party.person': {
    order: 300,
    resource: {nameColumn: 'lastName'},
    acl: {mode: 'scoped', scopes: ['belongsTo'], addScope: {predicate: 'belongsTo'}},
},
```

| Field                | Type                           | Default | Effect                                                                                                         |
| -------------------- | ------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------- |
| `mode`               | `none` / `scoped` / `explicit` | `none`  | `none` leaves the table unguarded; `scoped` lets a grant name a scope; `explicit` counts per-record rules only |
| `scopes`             | `string[]`                     | —       | predicates leading from the record to its scope (`belongsTo`, `isPartOf`)                                      |
| `selfScope`          | `boolean`                      | `false` | the record _is_ its own scope; `scopes` is ignored and there is no RBAC fallback                               |
| `addScope.column`    | `string`                       | —       | column on the submitted row that names the scope a new record is created in                                    |
| `addScope.predicate` | `string`                       | —       | scope edge submitted with a new record (`belongsTo`)                                                           |

A table declaring `acl` also needs the scope hierarchy to be in the graph — the grants are edges, so
`party.person --belongsTo--> party.unit` must exist before a grant on the unit can cover the person.

## 2. Pick the scope shape

| Shape           | Declaration             | Use when                                                                                                               |
| --------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| record → scope  | `scopes: ['belongsTo']` | the record belongs to a scope (a person to a unit, an invoice to an organization)                                      |
| record is scope | `selfScope: true`       | the hierarchy points _at_ the record: a unit belongs to an organization, and the organization itself has no scope edge |

`selfScope` has **no RBAC fallback**: an organization is visible only to a caller whose grant names
it or a parent organization. That is what makes an unassigned organization invisible rather than
open.

## 3. What gets enforced

| Operation                 | Behaviour                                                     | Error                    |
| ------------------------- | ------------------------------------------------------------- | ------------------------ |
| `get`                     | a denied record reads as missing                              | `acl.notFound` (404)     |
| `edit` / `remove`         | refused before anything is written                            | `acl.denied` (403)       |
| `find`                    | filtered inside the query, before paging                      | —                        |
| `add`                     | checked against the scope named by `addScope`                 | `acl.scopeDenied` (403)  |
| `{subject}.dropdown.list` | filtered like any other read                                  | —                        |
| `access.session.verify`   | re-validates the action live and requires the record or scope | `acl.notPermitted` (403) |
| `remove`                  | releases the rules that name the record first                 | —                        |

Handlers that never touch a guarded table are unaffected; a guarded table's own handlers get all of
the above without writing a single check.

## 4. Write the rules

**From the UI.** _ACL Rules_ (`access.acl`) is the explicit rule table: principal, action, target
kind, target, effect and active, with the names joined for display. On a role or user, the
**Access** tab lists the _effective_ rules with the source of each decision, and the **Record
Access** matrix edits scope × verb as tri-state cells — clicking a cell cycles allow → deny → no
rule, and a "no rule" cell removes the rule, which is how an implicit grant is narrowed back.

**From seeds.** The authorization merge accepts both halves:

```yaml
# implicit organizational grants (the hasScope edge)
scope:
    - {role: Admin, scope: Head Office, scopeType: unit}
    - {user: testAdmin, scope: Global Bank Corp, scopeType: organization}

# explicit rules — a wildcard target matches every record
acl:
    - {
          principal: Admin,
          principalType: role,
          target: '*',
          effect: allow,
          actions: party.person.edit,
      }
    - {
          principal: testUser,
          principalType: user,
          target: Jane Smith,
          targetType: person,
          targetKind: record,
          effect: deny,
          action: party.person.get,
      }
```

| Field                         | Meaning                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `principal` / `principalType` | who the rule is for — `user`, `role`, `unit`, `capability` (or a `typeAlias`)  |
| `action` / `actions`          | the guarded action(s) by name (`party.person.edit`, or a comma-separated list) |
| `target` / `targetType`       | the record or scope; `'*'` means every record                                  |
| `targetKind`                  | `record` (default), `scope`, or `all` for the wildcard target                  |
| `effect`                      | `allow` (default) or `deny`; a deny always wins                                |

A rule's action must be the _same identity_ as the guarded method: the runtime matches action names
with the dots removed, so `party.person.edit` and `partyPersonEdit` are one action, and a rule
pointing at a differently named duplicate would never apply.

**From handlers.** `access.acl.add` / `.edit` / `.remove` write single rules; the matrix on the role
and user pages is reconciled from the same helpers.

## 5. Ask inside a handler

```ts
export default handler(({handler: {accessAclAssert}}) => ({
    async invoiceInvoiceApprove(params: {invoiceId: string}, $meta: IMeta) {
        // Throws acl.notFound / acl.denied / acl.scopeDenied / acl.notPermitted.
        // `guarded: false` in the verdict means the entity opts out — proceed.
        await accessAclAssert({recordId: params.invoiceId, predicate: 'edit'}, $meta);
        // … proceed
    },
}));
```

`access.acl.assert` shares the SQL with the generic CRUD, so a manual check and the automatic one
can never disagree. `this.aclCheck({recordId}, $meta)` returns the same verdict from the adapter
side without throwing.

## 6. Custom deletes

A custom `remove` must delete the rules that name the record **before** deleting the record.
`access_acl` holds foreign keys to `core_resource`, so a delete that removes the entity row first
and then fails on a rule leaves a resource-only ghost — and because a resource is matched by name,
that entity can never be created again under its own name. The runtime's generic `remove` already
releases the rules, so a custom one only has to do the same when it bypasses the generic path.

## 7. Test it

- **Grant, then assert every path**: a denied record is filtered out of `find`, reads as
  `acl.notFound` on `get`, is refused on `edit` with `acl.denied`, and an `add` outside the scope
  fails with `acl.scopeDenied` — each call passing `$meta.expect: ['<error>']` and asserting the
  thrown error's `type`.
- **Prove the write, not just the read**: write a rule through the UI path (the matrix), read it
  back through the record's `get`, and then prove a write that the rule denies is actually refused —
  that is the round trip `realm/blong-party`'s ACL flow performs.
- **Guard against leftovers**: a role that owns rules cannot be deleted until they are released, so
  a test that creates rules should end by clearing them (or deleting the record through the
  runtime).

## 8. Troubleshooting

| Symptom                                        | Likely cause                                                                                                                                                          |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A rule seems to have no effect                 | its action resource is a different resource with the same dot-stripped name — write rules through the matrix, which resolves the action the same way the runtime does |
| Everything is visible after enabling the guard | the records are in no scope: check the `scopes` predicates and that the `access.effectiveScope` path was refreshed                                                    |
| An organization's records are always hidden    | `selfScope` has no RBAC fallback: the caller needs a grant naming the organization or a parent                                                                        |
| The matrix lists rows you did not expect       | its rows are every graph resource of the listed types — filter the Scope column                                                                                       |
