# Naming

In Blong a handler has exactly one name, and that name appears unchanged at every level: the file it
lives in, the function it exports, the method on the wire, the URL path that reaches it, and the row
the generated API documentation prints. Most frameworks treat naming as a style guide; here it is
the API.

## The invariant

`file name` = `exported function name` = `wire method` = `/rpc/<subject>/<object>/<predicate>`.

The name is a [semantic triple](https://en.wikipedia.org/wiki/Semantic_triple),
`subjectObjectPredicate`, with a singular subject and object and a present-tense predicate. The
subject is the namespace — usually the realm or one of its handler groups — and the object is the
entity the predicate acts on.

## Conventions

- **Reuse a standard predicate before inventing one**: `get`, `find`, `add`, `edit`, `remove`,
  `merge` for a single record; `insert`, `update`, `delete` for many.
- **Two-word properties**: `userName`, not `name`; `customerId`, not `id`.
- **One handler per file**, so `ctrl+p` plus the first letters of the triple finds it.
- **Library functions** are named the same way but are not exposed: a function whose name is not a
  valid triple is treated as a helper for its siblings.

## What the invariant buys

A route needs no routing table — the loader already knows the path of every handler. Validation,
OpenAPI documentation and generated UI pages all read the same name, so they cannot drift from the
implementation. And the framework checks the invariant rather than trusting it: a handler whose
function name disagrees with its file is rejected at load time, and [Kukum](./kukum.md), the
primitive generator, refuses to scaffold a name that breaks the conventions.

See the [handler patterns](../patterns/handler.md) for the file layout and the
[RPC](../patterns/rpc.md) page for the wire format, and [definitions](./definitions.md) for where
`subject`, `object` and `predicate` come from.
