# Realm Creation Eval — Canonical Prompt

Deterministic task used to measure how well the instructions produce a working Blong realm. Zero
ambiguous choices — quality deltas are attributable to the instructions, not prompt interpretation.

## Task

Create a new Blong realm named `blong-invoice`, following all Blong framework conventions.

Produce the **complete realm** as real files under the workspace. Do not stop at a plan — implement
it.

**GUARDRAIL** Implement without knowing the scoring, as the scoring is supposed to assess the
instructions.

## Requirements

### 1. Standard Realm structure

### 2. Entities

- invoice: id, number, name, total, status, creation time
- line: name, quantity, price

### 3. Schema & seeds

- register `invoice.invoice` and `invoice.line`
- production seed: 2 invoices, 2 lines
- test seed: 2 invoices + lines
- RBAC seeds

### 4. Handlers (semantic triples, one per file, file = export = method name)

- create an invoice with its lines
- list invoices with paging/filter
- append a line to an existing invoice

### 5. Errors

- invoice not found (parameterized with the id)
- invalid invoice status

### 6. Tests

- Test that adds an invoice then finds it (assert both succeed)
- UI tests with screenshots
- The test suite should utilize access control via blong-access

### 7. Suite wiring

- Register the `invoice` realm in the suite `server.ts` children

## Output

Real, complete files implementing all of the above — schema, seeds, handlers, errors, tests, and
wiring. Follow the framework conventions exactly per the instructions.
