<!--
    GENERATED — do not edit by hand.

    Rendered from a real run of the flows in `flow/` by `test/flow/observedFlows.test.ts`,
    which fails when this file is stale. Regenerate with:

        SEMANTIC_LOG_UPDATE_DIAGRAMS=1 ./node_modules/.bin/tap test/flow/observedFlows.test.ts

    Each block below is embedded **verbatim** in its section of
    `docs/blong/docs/patterns/semantic-log-flows.md`, and the same test compares the two —
    so a diagram cannot say one thing here and another there.
-->

# Observed flows

Each diagram below is drawn from what the **service observed** of one real execution: the
arrow is a call a record declared, the receiver is the participant the caller named, and
the label is the leg id the source code declares — so `hub.transfer.deliver` here is
greppable in the code that makes the call, and the table names the file and line that
declares it. Nothing is drawn from a document, which is what lets these replace hand-written
diagrams without becoming another one.

The counts are per execution, so a call a chatty participant logged five records about is
still one call. `x2` on an arrow would be two executions' worth of it, and a crossed arrow
is a call the caller declared that nothing answered — a deployment fact that a diagram
drawn from deductions could not show at all. An answered call is a pair: the request out,
and the answer back on a dashed arrow under the same leg id, because a receiver's own
record of the leg is what the answer is. The dashed arrow is drawn where the answer
arrived — after everything the call itself called has been answered, which the positions
say — so the pairs nest the way the execution did. A call that never leaves its own
participant is the one exception: it is drawn once, because the answer to it would repeat
the same caller, the same label and the same step, and the arrow is already solid — the
receiver's record is what made it solid in the first place.

<!-- BEGIN OBSERVED FLOWS: transfer.single -->
Participants: `payer`, `hub`, `payee`, `fxp`. 7 calls observed across 1 execution(s).

```mermaid
sequenceDiagram
    autonumber
    participant payer
    participant hub
    participant payee
    participant fxp
    Note over payer, fxp: PHASE 1: discovery
    payer->>hub: payer.discovery.parties
    hub->>payee: hub.discovery.payee
    payee-->>hub: hub.discovery.payee
    hub-->>payer: payer.discovery.parties
    Note over payer, fxp: PHASE 2: quote
    payer->>hub: payer.quote.rates
    hub->>fxp: hub.quote.fx
    fxp-->>hub: hub.quote.fx
    hub->>payee: hub.quote.payee
    payee-->>hub: hub.quote.payee
    hub-->>payer: payer.quote.rates
    Note over payer, fxp: PHASE 3: transfer
    payer->>hub: payer.transfer.submit
    hub->>payee: hub.transfer.deliver
    payee-->>hub: hub.transfer.deliver
    hub-->>payer: payer.transfer.submit
```

| call | caller → receiver | phase | position | declared | answered | declared in |
| ---- | ----------------- | ----- | -------- | -------- | -------- | ----------- |
| `payer.discovery.parties` | `payer` → `hub` | discovery | 1 | 1 | 1 | `flow/payer.ts:66` |
| `hub.discovery.payee` | `hub` → `payee` | discovery | 1.1 | 1 | 1 | `flow/hub.ts:68` |
| `payer.quote.rates` | `payer` → `hub` | quote | 2 | 1 | 1 | `flow/payer.ts:82` |
| `hub.quote.fx` | `hub` → `fxp` | quote | 2.1 | 1 | 1 | `flow/hub.ts:99` |
| `hub.quote.payee` | `hub` → `payee` | quote | 2.2 | 1 | 1 | `flow/hub.ts:110` |
| `payer.transfer.submit` | `payer` → `hub` | transfer | 3 | 1 | 1 | `flow/payer.ts:121` |
| `hub.transfer.deliver` | `hub` → `payee` | transfer | 3.1 | 1 | 1 | `flow/hub.ts:141` |
<!-- END OBSERVED FLOWS: transfer.single -->
<!-- BEGIN OBSERVED FLOWS: transfer.inter -->
Participants: `payer`, `hubA`, `proxy`, `hubB`, `payee`, `fxp`. 13 calls observed across 1 execution(s).

```mermaid
sequenceDiagram
    autonumber
    participant payer
    participant hubA
    participant proxy
    participant hubB
    participant payee
    participant fxp
    Note over payer, fxp: PHASE 1: discovery
    payer->>hubA: payer.discovery.parties
    hubA->>proxy: hubA.discovery.proxy
    proxy->>hubB: proxy.discovery.corridor
    hubB->>payee: hub.discovery.payee
    payee-->>hubB: hub.discovery.payee
    hubB-->>proxy: proxy.discovery.corridor
    proxy-->>hubA: hubA.discovery.proxy
    hubA-->>payer: payer.discovery.parties
    Note over payer, fxp: PHASE 2: quote
    payer->>hubA: payer.quote.rates
    hubA->>proxy: hubA.quote.proxy
    proxy->>hubB: proxy.quote.corridor
    hubB->>fxp: hub.quote.fx
    fxp-->>hubB: hub.quote.fx
    hubB->>payee: hub.quote.payee
    payee-->>hubB: hub.quote.payee
    hubB-->>proxy: proxy.quote.corridor
    proxy-->>hubA: hubA.quote.proxy
    hubA-->>payer: payer.quote.rates
    Note over payer, fxp: PHASE 3: transfer
    payer->>hubA: payer.transfer.submit
    hubA->>proxy: hubA.transfer.proxy
    proxy->>hubB: proxy.transfer.corridor
    hubB->>payee: hub.transfer.deliver
    payee-->>hubB: hub.transfer.deliver
    hubB-->>proxy: proxy.transfer.corridor
    proxy-->>hubA: hubA.transfer.proxy
    hubA-->>payer: payer.transfer.submit
```

| call | caller → receiver | phase | position | declared | answered | declared in |
| ---- | ----------------- | ----- | -------- | -------- | -------- | ----------- |
| `payer.discovery.parties` | `payer` → `hubA` | discovery | 1 | 1 | 1 | `flow/payer.ts:66` |
| `hubA.discovery.proxy` | `hubA` → `proxy` | discovery | 1.1 | 1 | 1 | `flow/hubA.ts:53` |
| `proxy.discovery.corridor` | `proxy` → `hubB` | discovery | 1.1.1 | 1 | 1 | `flow/proxy.ts:45` |
| `hub.discovery.payee` | `hubB` → `payee` | discovery | 1.1.1.1 | 1 | 1 | `flow/hub.ts:68` |
| `payer.quote.rates` | `payer` → `hubA` | quote | 2 | 1 | 1 | `flow/payer.ts:82` |
| `hubA.quote.proxy` | `hubA` → `proxy` | quote | 2.1 | 1 | 1 | `flow/hubA.ts:87` |
| `proxy.quote.corridor` | `proxy` → `hubB` | quote | 2.1.1 | 1 | 1 | `flow/proxy.ts:46` |
| `hub.quote.fx` | `hubB` → `fxp` | quote | 2.1.1.1 | 1 | 1 | `flow/hub.ts:99` |
| `hub.quote.payee` | `hubB` → `payee` | quote | 2.1.1.2 | 1 | 1 | `flow/hub.ts:110` |
| `payer.transfer.submit` | `payer` → `hubA` | transfer | 3 | 1 | 1 | `flow/payer.ts:121` |
| `hubA.transfer.proxy` | `hubA` → `proxy` | transfer | 3.1 | 1 | 1 | `flow/hubA.ts:119` |
| `proxy.transfer.corridor` | `proxy` → `hubB` | transfer | 3.1.1 | 1 | 1 | `flow/proxy.ts:47` |
| `hub.transfer.deliver` | `hubB` → `payee` | transfer | 3.1.1.1 | 1 | 1 | `flow/hub.ts:141` |
<!-- END OBSERVED FLOWS: transfer.inter -->