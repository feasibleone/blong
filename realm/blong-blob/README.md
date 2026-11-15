# @feasibleone/blong-blob

Stores and serves binary content for the realms that need it — photographs, documents, exports — and
keeps the record that says what each one is beside the bytes rather than in a table.

A realm attaches it as a **companion**: every process that carries it can store and serve its own
files, and the realm owns no process and publishes no Service of its own. What a record holds is a
reference, `blob://<namespace>/<key>`, never the content.

- [Blob concept](../../docs/blong/docs/concepts/blob.md) — what a stored blob is, and why the record
  sits beside the bytes.
- [Blob pattern](../../docs/blong/docs/patterns/blob.md) — wiring one into a realm, step by step.

## Wire names

Subject `blob`, so a realm that attaches this one reaches them through the handler proxy as
`<realm>.blob.*`.

| Name                  | What it does                                           |
| --------------------- | ------------------------------------------------------ |
| `blob.upload.prepare` | reserve a key, record what is coming, answer the route |
| `blob.upload.write`   | the raw `PUT` the bytes travel on (a route)            |
| `blob.upload.commit`  | promote a written upload, deriving variants            |
| `blob.upload.discard` | take an upload back, whatever state it reached         |
| `blob.blob.get`       | a blob's record, and its bytes on `content: base64`    |
| `blob.blob.find`      | what a namespace holds, by prefix or by expiry         |
| `blob.blob.remove`    | remove a blob and its record                           |
| `blob.storage.info`   | what the backend can do, and its last failure          |
| `blob.temp.cleanup`   | remove everything whose lifetime has passed            |
| `blob.scope.issue`    | mint the read cookie for the caller                    |

## Routes

Three serve bytes and declare `auth: false`: a browser element sends no bearer token, so the scope
cookie is the credential. The `PUT` carries the token, because writing is not a cookie's business.

| Route                             | Purpose                                    |
| --------------------------------- | ------------------------------------------ |
| `GET /a/<namespace>/<key>`        | the content                                |
| `HEAD /a/<namespace>/<key>`       | the headers a cache needs                  |
| `GET /a/<namespace>/<key>/thumb`  | the thumbnail the record carries, or `404` |
| `PUT /a/<namespace>/u/<uploadId>` | the bytes of a prepared upload             |

`blob.upload.write` declares `rawBody: true` — an upload arrives as `image/png`, which fastify has
no parser for — and the gateway mounts that one route in an encapsulated context that owns the
parser, so the rest of the process keeps answering `415` for a body it cannot read. Nothing is
switched on in the suite's config.

## Configuration

Under the realm's block, with the adapter that serves `blob.*` holding the realm's own decisions:

- `blob.storage` — the filesystem backend: `directory` and `namespaces`.
- `blob.s3Store` — the object-store backend; `false` skips that adapter.
- `blob.blobDispatch.crypto.key` — the AES-256-CBC key; the adapter carries a development one.
- `blob.blobDispatch.cookie` — `secret`, `ttl`, `name`, `path`; no secret means no cookie.
- `blob.blobDispatch.scope.providers` — who is asked for a reader's scopes (`party.scope.grant`).
- `blob.upload` — `maxBytes` (256 MiB), `base64MaxBytes` (1 MiB), `tempTtl` (24 h).
- `blob.variants` — `thumb`, `normal`, `crop`, and whether variants are derived at all.
- `blob.k8s` — the deployment role, `companion`: it owns no process.

The operator generates the key and the cookie secret into the suite's secret document. A development
run uses the committed ones, because two processes from one checkout have to agree.

## Backends

Both answer the same namespace, both stream and both range, so nothing in a caller or a test changes
with the choice — the realm's own suite runs against either with `BLOB_BACKEND=s3`.

- **`cacache`** (default) is a directory on one node: what development runs on, and what a
  single-replica deployment can use.
- **An S3-compatible bucket** is shared by every replica, so it is what a deployment with more than
  one replica uses.

**The scaling limit is sharing, not size.** A filesystem store belongs to a node, so with two
replicas an upload lands on one and a read may reach the other and answer `404`. A deployment gives
it one replica and a volume, or names an object store and shares the bucket. Neither imposes a
metadata ceiling — `blob.storage.info` is what a widget reads to pick a transport.

## Encryption

Content is `aes-256-cbc` under the configured key, with a random initial vector per blob recorded
beside the algorithm, so two identical files never produce identical ciphertext, and the algorithm
can change without a migration. The record's `digest` is SHA-256 of the _plaintext_: CBC does not
authenticate, so a flipped ciphertext bit decrypts into a flipped plaintext bit, and a mismatch is
refused as `blob.corrupt` rather than served.

## Development

```bash
npm run ci-test                    # the realm's suite, against a temporary cacache store
BLOB_BACKEND=s3 npm run ci-test    # the same groups against the dev MinIO bucket
npm run ci-lint                    # tsc, cspell, eslint, and the deployment manifests
```

The groups are `test.storage`, `test.crypto`, `test.upload`, `test.read`, `test.scope`, `test.temp`
and `test.variants`; `integration.watch.test` lists them, so a group is declared in one place.

The end-to-end proof lives outside this package: `realm/blong-party`'s profile spec and
`realm/blong-sport`'s document spec upload through the browser widget, then fetch the served bytes.
