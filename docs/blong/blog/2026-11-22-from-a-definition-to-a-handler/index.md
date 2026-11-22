---
slug: from-a-definition-to-a-handler
title: 'The API definition came first'
authors: [kalinkrustev]
tags: [blong, api, design, developer-experience]
---

Most codebases have the same document in two places. One is the OpenAPI file a client, a partner or
a former colleague reads; the other is the handler that actually answers. They are edited by
different people, drift apart quietly, and the drift is only visible when an integration breaks.

Blong's answer is not to generate the document from the code — that is the other direction, and it
only works when the code got there first. It is to accept the document as the source, and generate
what is missing: a typed handler stub, named where the framework's own conventions say it belongs,
written while the developer is still in the editor.

<!-- truncate -->

## The loop

```text
contract/realm.api.yaml          # published, versioned, edited by the owner of the contract
contract/realm.operations.yaml   # what the team is trying — merged on top of the base
```

Both files are loaded, in name order, so the second overrides the first and does not have to repeat
it. A method added to the override becomes a handler; a field added to a method grows the handler
that already existed. Save the file and the skeleton appears:

```text
info  ApiSchema wrote …/orchestrator/record/realmRecordFind.ts for realmRecordFind
```

Nothing else in the framework is watching that folder. The generation runs as part of the same load
that reads the definition, because both facts — "this method exists in the contract" and "this
folder holds the handlers for it" — are known there and nowhere else.

## The wiring file is where the two worlds meet

Here is the part that is usually a manual, error-prone translation: a published API is written in
somebody else's vocabulary. Its operations are called `createContract` and `issueInvoice`; the realm
calls its handlers `ordersContractAdd` and `ordersInvoiceIssue`, because that is the semantic triple
the rest of the framework speaks.

That translation does not belong in the published document, and it does not need a code generator
setting either. It is a small file merged over the document:

```yaml
# apis/contract.operations.yaml — none of contract.api.yaml is repeated
openapi: 3.0.3
x-blong:
    namespace: orders # this document serves the orders realm
paths:
    /contracts:
        post:
            x-blong-method: ContractAdd # → ordersContractAdd
```

Three names, and the path falls out of them:

```text
orders/orchestrator/contract/ordersContractAdd.ts
```

The namespace is the subject (`orders`), the first word of `x-blong-method` is the object
(`Contract`) and names the group folder, and the rest is the predicate (`Add`). Nothing is guessed
and nothing is configured per method. An operation that matches no folder is not filed somewhere
plausible — it is reported, because a silently misplaced handler is worse than a missing one.

The same file also does the quieter half of the job: it adds what the published document left out.
An invoice body whose members are all optional is a stub describing an invoice with no amount; one
`required: [contractId, amountMinor]` in the wiring file is the difference between a skeleton and a
skeleton that means something.

## What the stub is for

The generated body throws:

```ts
type Handler = (params: {
    customerName: string; // Who the contract is with.
    currencyCode: string; // ISO 4217 code the amounts are written in.
}) => Promise<{contractId: string; status: string}>;
```

The signature is the part worth generating, and it comes from the contract: query and path
parameters, the request body in either OpenAPI 3 or Swagger 2 shape, and the reply schema. The body
worth writing is the part the contract cannot know — which orchestrator to call, what to do when the
item is missing.

Returning `{}` would make a stub that compiles nowhere and fails at the first call with a type error
somewhere else; throwing says what it is, immediately, and the first honest line the developer
writes is the one that replaces it.

## The part that keeps it safe

A generator that writes into the source tree has to answer one question convincingly: when does it
stop being a generator? Here the answer is one line at the top of the file —
`import unchanged from '@feasibleone/blong'` — and it is a state rather than a note in a changelog.
While it is there the file is a stub and the next run rewrites it from the document, whatever
changed; delete it and the file is yours. That is what lets a dev run stay open while a contract
moves, and what keeps the generator from ever arguing with the person writing the code.

## Where the automation ends

Editing a definition by hand is one workflow. Writing it _before_ the code is another, and it is the
one an agent session does best: describe the API, then let tooling produce the files that must exist
for it. The same naming rules apply, and `blong-kukum` scaffolds the handlers on demand from the
command line or over the API — the same tree, without a process watching a file.

Between the two, the definition stops being a document that describes the code and becomes the thing
the code is generated from — and the drift has nowhere left to happen.

Read the full mechanics in the [api generation pattern](/docs/patterns/api-generation), and run
`demo/blong-generate` to watch three published documents become seven handlers across two realms.
