# API generation

A definition exists and the handlers that serve it do not. Under the `dev` intent the framework
writes a typed stub for every operation of a declared API that has no handler file yet, so the
interactive loop is: edit the definition, save, and the skeleton is there.

This is a **development** behaviour. It writes into the source tree, so no other intent turns it on
— see [When it runs](#when-it-runs).

## The pieces

```text
realm/                              # one namespace, named after this folder
├── apis/                           # every document the realm serves
│   ├── orders.api.yaml             #   published, untouched
│   ├── orders.operations.yaml      #   wired to the realm, merged over it
│   ├── invoices.api.yaml           #   a second document, wired the same way
│   └── invoices.operations.yaml
├── server/
│   └── api/
│       └── api.ts                  # the layer that names the folder
└── orchestrator/
    ├── order/                      # `realm.Order*` handlers (generated)
    └── invoice/                    # `realm.Invoice*` handlers (generated)
```

The layer file names one file of that folder. The **folder** is what gets read:

```ts
// server/api/api.ts
import {api} from '@feasibleone/blong';

export default api(() => ({
    url: new URL('../../apis/orders.api.yaml', import.meta.url).href,
}));
```

`url` is resolved where it is written — an `import.meta.url` gives a path that works from any
working directory — and one realm can serve several documents this way: each is read and bound to
the namespace its wiring file names.

## The published document and the wiring file

Every `<name>.<anything>.yaml` in that folder is one document, keyed by its first segment and merged
in name order — so `<name>.api.yaml` is laid down first and `<name>.operations.yaml` wins over it:

- `<name>.api.yaml` is the published definition: what another team reads and what a version number
  refers to. It is not edited to try something out;
- `<name>.operations.yaml` is the wiring file, and its job is to bind that document to this realm
  rather than to change it.

The wiring file usually **adds** rather than alters — three things, and a fourth when the published
document is incomplete:

| Job                           | Key                                        |
| ----------------------------- | ------------------------------------------ |
| bind the document to a realm  | `x-blong.namespace: realm`                 |
| name the triple               | `x-blong-method: ObjectPredicate`          |
| speak to the realm's readers  | reworded `summary` and `description`       |
| make an incomplete API usable | a missing `required`, a response, a schema |

```yaml
# orders/apis/orders.operations.yaml — merged over orders.api.yaml
openapi: 3.0.3
x-blong:
    namespace: orders
paths:
    /orders:
        post:
            x-blong-method: OrderAdd
            summary: Write an order down before anything is shipped
```

The namespace is worth its own line: the file's name is the _publisher's_, and nothing about
`invoices.api.yaml` says it serves the `orders` realm. `x-blong.namespace` is what makes its
operations `orders…` instead of `invoices…`.

## Where a stub goes

Three names decide it, and nothing guesses:

| Where it comes from           | Decides                                      |
| ----------------------------- | -------------------------------------------- |
| `x-blong.namespace`           | the subject — the realm, and the name prefix |
| `x-blong-method` (first word) | the group folder `orchestrator/<group>/`     |
| `x-blong-method` (rest)       | the predicate                                |

`x-blong-method: OrderAdd` in namespace `orders` is written to `orders/orchestrator/order/` as
`ordersOrderAdd` — a semantic triple, generated rather than transcribed. Keep the object
capitalised: the method is glued straight onto the namespace. A published document that already uses
this shape needs no `x-blong-method` at all: `operationId: OrderAdd` works as it stands.

An operation whose object matches no folder is reported rather than filed somewhere plausible:

```text
warn  ApiSchema no orchestrator folder for ordersReportExport
```

## What the stub is

```ts
/* eslint-disable @typescript-eslint/no-unused-vars -- a generated stub has not used its arguments yet */
import unchanged from '@feasibleone/blong';
import {type IMeta, handler} from '@feasibleone/blong/types';

// #region API
type Handler = (params: {
    customerName: string; // Who the contract is with.
    currencyCode: string; // ISO 4217 code the amounts are written in.
    note?: string; // Free text the sales desk may leave on the draft.
}) => Promise<{
    contractId: string;
    status: string;
}>;
// #endregion

export default handler(
    () =>
        async function ordersContractAdd(
            params: Parameters<Handler>[0],
            $meta: IMeta,
        ): ReturnType<Handler> {
            // A stub, not a handler: the signature is the contract, the body is yours. Throwing says
            // so at the first call rather than answering a reply that was never computed.
            throw new Error('generated stub: ordersContractAdd has no body yet');
        },
);
```

Three properties matter:

- **the types come from the definition** — query, path and header parameters, the request body (both
  the OpenAPI 3 `requestBody` and the Swagger 2 `parameters[in: body]` shapes), and the reply
  schema;
- **the body throws** — a stub that answered `{}` would be a lie that type-checks nowhere, and one
  that answered nothing would fail silently;
- **`import unchanged from '@feasibleone/blong'` is the marker** — the same one `blong-kukum`
  writes, and the thing that decides whether the file is still a stub.

The marker is the whole rule, and it works in both directions:

| The file                    | What the next run does                                |
| --------------------------- | ----------------------------------------------------- |
| does not exist, or is empty | writes the stub                                       |
| still has the marker        | writes it again from the definition, whatever changed |
| the marker is gone          | leaves it alone — the file is the developer's         |

So the interactive loop closes: change `operations.yaml`, save, and the stubs of every operation it
touches are brought up to date.

The hand-off is automatic, and that is the point of using an **unused import** as the marker: an
editor that removes dead imports on save deletes it the first time somebody edits the file, so the
file stops being generated exactly when a person starts working in it — no ritual "remember to
delete this line". (If your editor keeps unused imports, delete the line yourself; the rule is the
same.) Both verbs of the [check](#keeping-the-stubs-in-step-with-the-documents) apply it too: a stub
that lost its marker is neither reported as drift nor written over, because it is no longer the
generator's file.

## When it runs

| Intent                                       | `apiSchema.generate` |
| -------------------------------------------- | -------------------- |
| `dev`                                        | `true`               |
| everything else (`release`, `cli`, `k8s`, …) | `false`              |

The defaults live in the synthetic config in `core/blong-gogo/src/load.ts`; a realm or a suite can
ask for the opposite in its own block:

```ts
// a realm that wants stubs written under an intent the framework keeps quiet
export default realm(() => ({
    url: import.meta.url,
    children: [],
    config: {default: {}, dev: {}, microservice: {apiSchema: {generate: true}}},
}));
```

The log follows the effect rather than the scan:

```text
info  ApiSchema wrote …/orders/orchestrator/contract/ordersContractAdd.ts for ordersContractAdd
```

One line per file written, and nothing at all for a folder that generated nothing — a scan runs for
every handler group of every realm, on every reload, so a line per scan is noise rather than
information.

## Keeping the stubs in step with the documents

The generator never rewrites a file that has content, which is what makes it safe to leave running —
and which means it cannot answer "is this stub still what the document says?" on its own: an
existing stub is exactly the case it skips. The answer is a check that generates into a **throwaway
copy** of the tree and compares:

| Command                   | What it does                                                     |
| ------------------------- | ---------------------------------------------------------------- |
| `npm run generate:check`  | generates elsewhere, compares, exits 1 and names each difference |
| `npm run generate:update` | writes what the documents describe over the committed stubs      |

Both are the demo's own scripts (`demo/blong-generate/generate.tool.ts`), and the same comparison
runs in its test, so a document changed without regenerating fails CI with the file name and the
command to run. The pattern is worth copying into a realm that keeps generated stubs in the
repository: the check is what stops a stub describing last month's contract.

## Limits worth knowing

- **The pass pairs what exists when it runs.** A definition is resolved as its layer loads, so a
  group folder scanned _after_ it is not paired until the process restarts. The well-known folders
  sort `orchestrator` before `server`, which is why the demo works; a realm whose API layer sorts
  first does not. Moving the pass to one sweep after the platform loads is tracked in the
  repository's memory (@@T-757).
- **One namespace per realm.** The realm folder name _is_ the namespace — the subject of every
  handler in it — so a second namespace is a second realm. Several _documents_ in one namespace are
  ordinary and are what `demo/blong-generate` shows.
- **The server platform only.** The browser carries no `ApiSchema`, so the `api` layer contributes
  nothing there.
- **A reload does not re-resolve the definition.** Editing a contract file and touching a source
  file reloads the handlers; restarting the process is what re-reads the definition.

## See it work

`demo/blong-generate` is one realm with two published documents — a contract API and an invoice API
— and four generated handlers, with a README that walks the loop and a test that regenerates a stub
and compares it with the committed one.

For agent-driven work — an API definition written before any code — `blong-kukum` scaffolds the same
handlers on demand from the command line or the API, which is the shape a session that is not
watching a file wants.
