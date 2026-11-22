# blong-generate

A demo of one loop: **API documents exist, and the handlers that serve them do not.** A dev run
writes a typed stub for every operation that has no file yet, named and shaped by the definition.

Two realms, three published documents, seven operations — all of them somebody else's documents, all
wired to a realm by a small file beside them:

- `orders` serves **two** documents, a contract API and an invoice API, in one namespace (`orders`);
- `stock` serves one, in its own namespace (`stock`) — the ordinary case, there for comparison.

```text
demo/blong-generate/
├── server.ts                            # the suite: two realms, ports on 0
├── orders/                              # realm — namespace `orders`, two documents
│   ├── apis/
│   │   ├── contract.api.yaml            # published by the sales team, untouched
│   │   ├── contract.operations.yaml     #   wired: x-blong.namespace, x-blong-method
│   │   ├── invoice.api.yaml             # published by the finance team, untouched
│   │   └── invoice.operations.yaml      #   same, plus the `required` the publisher left out
│   ├── server/api/api.ts                # names the folder to read
│   └── orchestrator/
│       ├── contract/                    # generated: ordersContractAdd, ordersContractGet
│       └── invoice/                     # generated: ordersInvoiceIssue, ordersInvoiceGet
└── stock/                               # realm — namespace `stock`, one document
    ├── apis/{stock.api.yaml, stock.operations.yaml}
    ├── server/api/api.ts
    └── orchestrator/item/               # generated: stockItemGet, stockItemAdjust, stockItemReserve
```

## Run it

```bash
cd demo/blong-generate
blong ./server.ts dev
```

The first run writes seven handlers and says so, one line each:

```text
info  ApiSchema wrote …/orders/orchestrator/contract/ordersContractAdd.ts for ordersContractAdd
info  ApiSchema wrote …/orders/orchestrator/contract/ordersContractGet.ts for ordersContractGet
info  ApiSchema wrote …/orders/orchestrator/invoice/ordersInvoiceIssue.ts for ordersInvoiceIssue
info  ApiSchema wrote …/orders/orchestrator/invoice/ordersInvoiceGet.ts for ordersInvoiceGet
info  ApiSchema wrote …/stock/orchestrator/item/stockItemGet.ts for stockItemGet
info  ApiSchema wrote …/stock/orchestrator/item/stockItemAdjust.ts for stockItemAdjust
info  ApiSchema wrote …/stock/orchestrator/item/stockItemReserve.ts for stockItemReserve
```

To watch it happen again, delete what you want regenerated and let the watcher restart the load:

```bash
rm orders/orchestrator/invoice/ordersInvoiceGet.ts    # then touch a source file, or restart
```

The rule is the marker at the top of every stub, in both directions:

| The file                        | What a run does                                 |
| ------------------------------- | ----------------------------------------------- |
| missing, or empty               | writes the stub                                 |
| still carries the marker import | rewrites it from the document, whatever changed |
| the marker has been deleted     | leaves it alone — the file is yours             |

So leaving the dev run watching is the point: edit a document, save, and the stubs it touches come
up to date. Start writing a body and delete the `import unchanged from '@feasibleone/blong'` line
first; from then on the file is ordinary code the generator no longer reads.

## The published document, and the wiring file

`contract.api.yaml` is the sales team's document: their `operationId`s (`createContract`,
`getContract`), their summaries, their `servers`. It is versioned with their portal and this realm
does not get to rewrite it. `stock.api.yaml` is the same arrangement with one document instead of
two, which is the ordinary case and the reason the namespace there is named after its own entity.

`contract.operations.yaml` is merged over it and does the three things a team actually needs:

| Job                          | How                                  | Visible in the stub as                 |
| ---------------------------- | ------------------------------------ | -------------------------------------- |
| bind the document to a realm | `x-blong.namespace: orders`          | `orders…)` in the handler name         |
| name the triple              | `x-blong-method: ContractAdd`        | `Contract` → folder, `Add` → predicate |
| speak to its own readers     | reworded `summary` and `description` | the `//` comments on members           |

`invoice.operations.yaml` does a fourth, which is the most common reason an override exists at all:
the published body declares `contractId` and `amountMinor` as optional — that is how the finance
portal has always called it — and the wiring file adds

```yaml
requestBody:
    content:
        application/json:
            schema:
                required: [contractId, amountMinor]
```

so the generated stub asks for what the realm actually needs. Without it the handler would take
`amountMinor?: number` and describe an invoice with no amount.

## What decides where a stub goes

Three names, and the demo's test checks all of them:

| Where it comes from           | Example       | Decides                                     |
| ----------------------------- | ------------- | ------------------------------------------- |
| `x-blong.namespace`           | `orders`      | the handler's subject — `orders…`           |
| `x-blong-method` (first word) | `ContractAdd` | the group folder — `orchestrator/contract/` |
| the rest of `x-blong-method`  | `Add`         | the predicate — `ordersContractAdd`         |

An operation whose object matches no folder is reported instead of guessed:

```text
warn  ApiSchema no orchestrator folder for ordersReportExport
```

## When it runs

Generation is a **dev-only** behaviour: it writes into the source tree, and a process that is only
serving — or one writing Kubernetes manifests — has no business editing the code it was started
from. The synthetic config in `core/blong-gogo/src/load.ts` sets `apiSchema: {generate: false}` for
every intent and `true` under `dev`; a realm can also ask for it by name in its own block.

The log is the other half of that decision: nothing is said about a scan that produced nothing, so
the lines a run prints are the files it actually wrote, plus the operations it could not place.

## Keeping the stubs in step with the documents

A generator that never overwrites a file — the property that makes it safe to leave running — cannot
answer "does this stub still match its document?" by itself: an existing stub is exactly the case it
skips. Two scripts answer it by generating into a **throwaway copy** and comparing:

```bash
npm run generate:check     # exit 1 and name every stub that moved
npm run generate:update    # rewrite the stubs from the documents
```

`generate:check` is what a stale stub looks like:

```text
generate:check — 1 stub(s) do not match the documents; run `npm run generate:update`
  orders/orchestrator/contract/ordersContractGet.ts
```

`generate:update` is the deliberate overwrite: it writes every stub the documents describe, creating
the ones that are missing and replacing the ones that drifted. It is a **separate command** rather
than a flag on the dev server, because regenerating is a decision about the repository, not
something a running process should do behind you — and because the check has to be able to fail.

Both live in `generate.tool.ts`, and `npm test` calls the same comparison, so a document edited
without regenerating the stubs fails CI with the file name and the command to run.

## Tests

```bash
npm test          # or: node generate.test.ts
```

`generate.test.ts` runs the demo's own suite through `load()` with the `dev` intent and reads what
the run wrote — no test doubles, the same path a developer takes. It asserts that the seven stubs
exist and name their operation; that the wiring file decided the namespace, the object and the
required members; that **every committed stub is exactly what a fresh generation writes** (drift
fails here, and in `generate:check`); that each folder holds exactly its own realm's handlers; and
that a file a developer has written in is never overwritten by a run in place.

## Not shown here

The stubs throw: `generated stub: ordersContractAdd has no body yet`. Filling them in is the work —
a handler body reaches its data through an orchestrator (see `demo/blong-marine`,
`suite/blong-suite`) — and the generated signature is what makes that filling-in type-checked from
the first line.
