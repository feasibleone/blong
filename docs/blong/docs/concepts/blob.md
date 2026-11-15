# Blob

A **blob** is a piece of content the framework stores for you and names for you: a photograph on a
person, a PDF filed against a document, a spreadsheet a report exports. The realm that stores it is
`blong-blob`, and what it hands back is never the content — it is a name for it, which is what a
record holds and what a page renders.

## What it is

Three parts, and the separation is the whole design.

**The bytes** live in a backend — a local `cacache` directory or an object store — addressed by a
key the store generates. They are written once and read by key; nothing rewrites them.

**The record** lives beside the bytes in the same backend, not in a table. It says what the content
is: media type, size, digest, original name. It also says who may read it (`scopes`) and whether it
is still `pending` or already `stored`. This realm has no database on purpose: a store that needed a
table would be a store that cannot serve a process without one.

**The reference** is the string a record holds: `blob://<namespace>/<key>`. It survives a form, a
round trip through the database and a JSON call, and it is what a UI field stores.

A namespace separates one realm's files from another's inside one store: `party` for photographs,
`sport` for documents. It is a claim the _owning_ realm declares, not a string a caller chooses at
upload time — what a caller may write to is decided by the authorization list, because a capability
is granted per method.

## Why the record sits beside the bytes

A key is generated, so it carries no extension: a reader cannot tell a PNG from a PDF by its name.
The record answers that, and three more things a name cannot.

- **`contentType`** — what to render it as, which is how an image becomes a picture and a PDF
  becomes a file icon with a download link.
- **`digest`** — SHA-256 of the _plaintext_. AES-256-CBC does not authenticate, so a flipped
  ciphertext bit decrypts into a flipped plaintext bit; the digest is the check that catches it, and
  a mismatch is `blob.corrupt` rather than corrupt content handed to a reader.
- **`scopes`** — who may read it back, which is the subject of the read cookie below.

## Encryption at rest

Content is encrypted with `aes-256-cbc` under a key the deployment supplies, and **each blob records
its own initial vector** beside the algorithm. A per-blob IV keeps two identical files from
producing identical ciphertext, and recording it per blob lets the algorithm change without a
migration: the reader asks the record, not the configuration.

The key belongs to the deployment (`blob.blobDispatch.crypto.key`), and the operator generates it
into the suite's secret document. A process started without one uses the development key committed
in the realm's own port — deliberately public, so two processes from one checkout can read each
other's files.

## The read cookie

A stored file is read by a **browser element**, not by a call: an `<img>`, an `<a download>`.
Nothing in that request can carry the session's bearer token, so the read cannot be authorized the
way every other call is.

The sentence that follows a small design. The realm mints a **cookie** for the reader — HMAC over a
small payload of actor, scopes and expiry — path-scoped to `/a/` so it never travels with the rest
of the app, and the serving route verifies it in-process. No database is consulted, so the read
costs a signature check and the bytes.

The scopes it carries are collected from the realms that know what a scope means (each answers a
provider call such as `party.scope.grant`), plus `authenticated` for a caller that proved who they
are. The cookie is minted once per session and again when the reader's authority changes; a cookie
older than that shows a picture that is no longer theirs to see.

`blob.scope.issue` is where the cadence lives, and the _shell_ calls it rather than the page: the
portal configuration names the method and the app issues the cookie once the session is up.

## Lifecycle

A blob is in one of two states, and the difference is who may read it.

| State     | Written by            | Readable by       | Removed by                  |
| --------- | --------------------- | ----------------- | --------------------------- |
| `pending` | `blob.upload.prepare` | nobody            | the sweep, once `expiresAt` |
| `stored`  | `blob.upload.commit`  | a matching cookie | `blob.blob.remove`          |

The record is written **before** any byte arrives. That ordering is what makes an abandoned form
recoverable: a browser that closes mid-upload leaves a `pending` record with an expiry, and
`blob.temp.cleanup` — a handler the deployment schedules, not a timer inside the realm — finds it. A
realm that swept its own files would sweep once per replica, and the replicas would race.

## What a blob is not

It is not a file system, not a CDN, and not a document manager. It keeps content and answers where
it is; naming, versioning, filing against entities and deciding who may see what are the owning
realm's business. The [asset server](./glossary.md) is a different thing again — it serves a suite's
browser bundle; the blob store serves what people put in it.

## Where to go next

- [Blob pattern](../patterns/blob.md) — wiring one into a realm, step by step.
- [Glossary](./glossary.md) — the terms this page introduces.
