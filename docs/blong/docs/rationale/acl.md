# Why records are narrowed next to RBAC

## The problem

Method-level authorization answers the wrong question for most business rules. "May this caller edit
persons?" is rarely the requirement; "may this caller edit _the persons of the head office_?" is.
Expressing that with method-level roles means inventing a role per data slice (`HeadOfficeEditor`,
`BranchEditor`, …): roles that multiply with the org chart and the entity types, and that stop
describing a job at all.

The obvious alternative — a rule row per user and record — replaces that with two new problems: the
rule table grows as users × records, and it drifts from reality every time the organization changes.

## The approach

Keep the coarse gate and add a **narrowing layer** that the runtime applies for the caller:

- **Organizational grants are edges, not rows.** A `<principal> --hasScope--> <scope>` edge means
  "for every action this principal holds, and every record reachable from that scope". Because it
  rides the existing hierarchy, moving a person between units or a unit between regions needs no ACL
  change.
- **Explicit rules carry the exceptions** — a single record, or a scope that must be forbidden even
  though the hierarchy grants it. They live in `access_acl`, keyed by principal, action and target.
- **The verdict is computed in SQL at query time**, as a filter on the query itself. There is no
  materialized effective table to invalidate, so a grant takes effect on the next read.
- **The guard is declared on the table** (`acl: {…}` in the schema) and implemented once in the
  runtime's generic CRUD, so every path — reads, writes and dropdowns, which are reads — obeys it
  without the handler doing anything.

## Decisions and trade-offs

**Deny wins.** An explicit deny must be able to override an organizational grant. The alternative
("most specific wins", or a precedence ladder) requires every reader to re-implement the ladder in
their head; predictability was chosen over expressiveness.

**Opt-in per table, tolerant of existing data.** A record that participates in no scope is not
narrowed at all and falls back to RBAC alone. That is what makes switching the guard on safe: a
table with no `acl` spec behaves exactly as before, and a guarded table changes nothing until a
grant exists.

**Filter before paging, and hide reads.** `find` is filtered as part of the query, so the total
counts only readable records — filtering after paging would render phantom pages. A denied
single-record read is reported as _not found_ rather than _forbidden_, so the response cannot be
used to probe for rows the caller may not see.

**A record's own rules die with it.** Deleting a guarded record releases the rules that name it. The
alternative was learned the hard way: the rules hold foreign keys to the resource, so a delete that
removed the entity row first and then failed on a rule left a resource-only ghost — and since a
resource is matched by name, that entity could never be created again under its own name.

**The editor is a grid, not a form per rule.** A scope × verb matrix of tri-state cells (allow /
deny / no rule) matches the shape of the decision an administrator is making, and a "no rule" cell
_removes_ the rule, which is how an implicit grant is narrowed back. A row per rule would turn one
decision into a dozen forms.

## What was rejected

- **ACL checks inside each business handler** — easy to forget, impossible to audit centrally, and
  every new handler becomes a chance to leak records.
- **A rule row per user and record** — rule explosion plus drift from the org chart.
- **A materialized "effective access" table** — it would be stale by design in a system whose
  hierarchy changes; the ACL is a filter, not a cache.
- **Enforcing it in the browser** — the UI hides what a caller may not do; only the server refuses
  it.
