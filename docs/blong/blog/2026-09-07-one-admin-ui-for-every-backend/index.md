---
slug: one-admin-ui-for-every-backend
title: One admin UI for every backend
authors: [kalinkrustev]
tags: [blong, tooling]
---

Count the backends a normal system depends on. A relational database for the data, a bucket for the
files, a key-value store for the cache, a queue for the events, a secret store for the credentials,
a directory for the users, and a cluster running all of it. Then count the screens: one per backend,
each with a slightly different table, a slightly different filter box and the same four bugs.

The commander realm describes each of those as a **source** — a namespace of triples with levels —
and renders all of them with one explorer. The screens disappear; what remains is a descriptor per
backend and, where the connection needs one, a small adapter.

![Every configured source in one tree — Kubernetes, S3, Vault, Mongo, Redis, Kafka, Keycloak and the SQL database](../../docs/patterns/img/commander-sources.png)

<!-- truncate -->

## A backend is a namespace of triples

```typescript
export interface ICommanderSource {
    name: string; // lowercase instance namespace — the subject of every triple
    label: string;
    icon?: string;
    permission?: string;
    levels: ICommanderLevel[];
}

export interface ICommanderLevel {
    label: string;
    list?: {method: string; params?: object}; // the list triple for this level
    open?: {method: string; params?: object}; // the detail triple, when the level has one
    permission?: string; // the action a caller needs to see this level
    viewer?: string; // which viewer renders a node of this level
}
```

Eight sources ship today: the SQL database (through the access realm's own table method, with no
dedicated adapter), Kubernetes, S3, Vault, MongoDB, Redis, Kafka and Keycloak. Each is a hierarchy
of levels whose `list` and `open` name **existing triples** — `k8s-dev` lists namespaces through the
Kubernetes adapter, `redis-dev` lists keys through the Redis adapter — so the explorer never learns
what a backend is. It posts `{source, level, parent}` to `commander.branch.list`, that handler
resolves the level's triple and calls it, and the rows come back.

That indirection is what makes "a new backend is a source, not a screen" literally true. A source is
one entry in `config/sources.ts`. If the backend needs a connection the framework does not have, it
needs an adapter too — and then a viewer only if its resources have a shape none of the existing
ones does, because viewers are keyed by _resource type_ rather than by backend.

## The explorer is one component

The shell lives in `blong-browser`, not in the realm, because it is not commander-specific: the
realm contributes descriptors and handlers, and the component renders whatever it is given.

- The **tree** is built from the source list, one root per source.
- The **table** comes from the level's `list` triple, and the handler flattens heterogeneous rows so
  the same table can show a Kubernetes object and a SQL row.
- The **filter** is client-side over the flattened row, and the **columns** are derived from the
  data — scalar fields only. Nothing per-backend is configured for a table to appear.
- **Opening** a node is opt-in per level: with an `open` triple you get the fetched detail, without
  one you get the row you already had.
- **Viewers** are chosen by the node's own type metadata: JSON, key/value, file, image, table,
  document, secret, YAML, message, pod log.

![The same explorer, drilled into the SQL source: the access realm's tables](../../docs/patterns/img/commander-access-db.png)

Two pictures, one component, seven backends between them — and the second one is the SQL source,
which has no adapter and no per-backend code at all. It is a descriptor pointing at a method the
access realm already exposed.

## It lists; it does not write

This is the part of the idea that has to be said plainly, because an admin UI invites the opposite
assumption: **there is no write path in the realm**. No edit, update, save, delete or create handler
exists anywhere in it, and the action method offers only `copyPath`, `open` and `refresh`. The tool
explores.

That is a defensible place to stop — a screen that can mutate a production Kubernetes object or a
Vault secret needs an authorization story this realm does not attempt — but it does mean "admin UI"
is a description of the audience rather than a claim about capability. What it gives an operator is
the ability to _find and read_ anything in six systems through one page, which is the part that was
missing.

## Authorization is per level

A source carries a `permission` and so does a level, and the list method prunes the tree by the
caller's effective actions before returning it: a source a caller cannot use is not a source they
see, rather than a source that fails when clicked. The gating is fine-grained enough to be useful —
one level of the S3 source can be granted while the rest stays hidden, and the Kubernetes namespace
gates a whole subtree while its synthetic category and resource levels are deliberately ungated,
because they describe what is inside a namespace the caller already reached.

## The local wiring, and a claim worth correcting

Each `*Dev` adapter extends the real one and supplies a local endpoint, local credentials and the
settings a local backend needs: Kafka gets a JSON codec, short session timeouts and admin mode (so
the topic list comes from metadata rather than from consuming the stream), S3 gets path-style URLs
for MinIO.

The tempting description — "the dev conveniences live in a dev-intent adapter" — is wrong, and the
code is the reason: they declare `activation.default`, not `activation.dev`, and the framework
merges the `default` block in _every_ intent. A deployment that loaded this realm would get
localhost endpoints unless it overrode them. The accurate reading is "a dev-wired instance of the
adapter", which the realm's own entry decides whether to include. It is the kind of nuance that
documentation usually smooths over and that costs somebody an afternoon in an environment they
cannot explain.

Four other things in the realm are declared but not wired, and they are recorded rather than
discovered later: `commander.node.viewer` and `commander.node.action` are registered,
gateway-validated and never called by the shipped page; the `commander.sources` configuration
override has no provider, so the hardcoded array always wins; `ICommanderLevel.model` is used by no
source; and three of the eight sources — Kubernetes items, Kafka messages, Keycloak users — have no
`open` triple yet, so their viewers show the list row rather than fetched detail.

## Yes, it works

The claim is easy to make and worth testing, so it was: all seven backends are reachable in this
environment, the realm's own protocol test passes, and the Playwright suite was run source by source
— the tree renders its eight roots, and drilling each one returns real rows from the real service.
The two images above come from a capture spec that photographs the explorer, asserts the eight
sources and a known row, and writes nothing unless it is asked to, so the pictures are regenerable
rather than hand-made.

The full reference — the descriptors, the eight sources, the viewer registry, the authorization seed
and the checklist for adding a source — is in [the commander pattern](/docs/patterns/commander).
