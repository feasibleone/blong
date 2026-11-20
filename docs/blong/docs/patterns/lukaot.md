# lukaot

How to declare a vocabulary and call it. This page is organised by the **four kinds** — the call
shapes a declaration produces — and each section puts the code a service writes today beside what
lukaot asks it to write instead, so the difference can be judged line by line.

- [Concept](../concepts/lukaot.md) — what it is, in one page
- [Flow walkthrough](./lukaot-flows.md) — two topologies drawn from a real run
- [Rationale](../rationale/lukaot.md) — why the identity is declared rather than derived

## Where a declaration lives

A realm declares once, in a `lukaot/` folder beside its layers:

```text
realm/blong-agent/
    lukaot/
        signal.ts      # declare({log: {...}})
        error.ts       # declare({error: {...}})
    orchestrator/...
```

The realm's `Realm.addLayer` collects every declaration into **one array** shared by all its layers'
results, and a port attaches the composed registry to itself, so a handler in any layer of that
realm reads the same `signal` proxy. A companion realm's vocabulary composes in through its own
layer, and two declarations of one name are refused with both origins named:

```ts
export default declare({
    log: {
        agentTicketClaimed: {level: 'info', message: 'worker {workerId} claimed ticket {ticketId}'},
    },
});
```

The identifier is an object-literal property, so nothing is quoted, and its grammar is a camelCase
token (`^[a-z][A-Za-z0-9]*$`): no dots, no spaces, no punctuation. One search finds the declaration,
the call sites, the policy override and the record.

### A library, and a page

Two cases have no realm of their own to declare into, and both are why `contribute` exists. A
**package** with handlers but no realm — `core/blong-mock`, `core/blong-chain` — declares once at
its own module load, and every port in the process composes what was contributed ahead of the
layer's own vocabulary:

```ts
// core/blong-mock/lukaot.ts, imported for its side effect
export const mockVocabulary = contribute({
    log: {mockCallAnswered: {level: 'debug', message: 'mock {predicate} answered'}},
});
```

A **browser realm** declares the same way, because a page has no port for the realms it does not
own: `core/blong-browser/lukaot/signal.ts` contributes its names, `browser.ts` lists the folder
among the realm's children, and a component reaches them through the log —
`BrowserLog.signalFor(name, level)` builds the same view over the contributed vocabularies, bound to
the component's name so the record keeps its header. The browser loader discovers no folders on its
own, so a `lukaot/` folder that is not listed as a child never loads, and its absence is silent:
every call site is written with `?.`.

## How a call site reaches it

| Surface                                            | Who reaches it                         | What it is                                                      |
| -------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------- |
| `this.signal?.<id>?.(…)`                           | a handler, an adapter, an orchestrator | the flat map of declared **log** identifiers                    |
| `errors.<id>(…)`                                   | a handler's factory argument           | the declared **errors**, constructed and recorded on the way in |
| `this.capture?.<shape>?.(selector, () => payload)` | a port that keeps payloads             | the declared **captures**, keyed by shape family                |
| `decide(vocabulary.decision.<id>, values, arms)`   | wherever code branches                 | the declared **decision**, recorded on the next record          |
| `lib.signal?.<id>?.(…)`                            | an injected library function           | the same proxy, handed over because a `library()` has no port   |

Every call is written with `?.` on both halves. A component that declared nothing has no `signal`,
and that has to be a no-op rather than an error — the same degradation a port without a vocabulary
gets.

A **program that is not a realm** builds the surface itself, which is what the flow fixtures do per
participant:

```ts
import {compose, createRegistry, signalView, type SignalWriter} from '@feasibleone/lukaot';

const writer: SignalWriter = record => logger[record.level](record.message, record.params ?? {});
const signal = signalView(createRegistry(compose(runtime, participant)), writer).vocabulary;
```

## 1. `log` — a line, with a name

**Before.** The call site composes the sentence, and the level is the only dial:

```ts
// pino, and this framework's own first log
this.log?.warn?.(`rate declined: ${rate} is above ${rateLimit}`, {rate, rateLimit});
```

Three consequences follow, and none of them is about the sentence being hard to write: two spellings
of one event are two rows in any aggregation; there is no way to silence _this_ warning without
editing this line; and an alert rule written against the text breaks the first time somebody adjusts
a word.

**With lukaot**, the sentence is declared and the call site names it:

```ts
export const fxpVocabulary = declare({
    log: {
        fxpRateDeclined: {level: 'warn', message: 'rate declined: {rate} above {rateLimit}'},
    },
});
```

```ts
signal?.fxpRateDeclined?.({rate, rateLimit});
```

| Field     | Type                                     | Meaning                                                                |
| --------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| `message` | string, with `{name}` placeholders       | the sentence; the placeholders are typed at the call site              |
| `level`   | `trace\|debug\|info\|warn\|error\|fatal` | the level the policy starts from                                       |
| `enabled` | boolean                                  | whether the signal is emitted at all                                   |
| `sample`  | number, `0…1`                            | the fraction of calls recorded                                         |
| `mtid`    | string                                   | the envelope kind — `event` for something that happened to the process |
| `method`  | string                                   | the operation the line belongs to                                      |

The **parameters are the message's placeholders**: a message naming `{ticketId}` makes the call site
supply it, so a placeholder the call does not pass is a type error rather than a `?name?` printed at
somebody.

## 2. `error` — a failure, and its answer to the caller

**Before.** The message is at the throw site, the answer to the caller is an `if` somewhere else,
and nothing identifies the case:

```ts
if (ticket === undefined) throw new Error('ticket not found');
```

A caller that wants to answer 404 has to match on the message; a test that wants to assert the case
has to match on the message; and the identity of the failure is the sentence — so rewording it
breaks both.

**With lukaot**, the failure is declared with the status it answers and a message that interpolates
its parameters:

```ts
export default declare({
    error: {
        agentTicketNotFound: {
            message: 'ticket {ticketId} is not in the pool',
            statusCode: 404,
        },
    },
});
```

```ts
if (ticket === undefined) throw errors.agentTicketNotFound({ticketId}, $meta);
```

| Field        | Type       | Meaning                                                                    |
| ------------ | ---------- | -------------------------------------------------------------------------- |
| `message`    | string     | the sentence, with `{name}` placeholders                                   |
| `statusCode` | number     | the HTTP answer the gateway gives it                                       |
| `silent`     | boolean    | control flow rather than a fault: constructed and throwable, not recorded  |
| `level`      | level name | the level the record is written at when it is recorded; `error` by default |

**Constructing is recording.** The declared error is an `ITypedError` (`type`, `params`,
`statusCode`, `$meta`) and the record is written when it is created, so `throw errors.x(…)` and
`throw this.signal?.x?.(…)` are one statement. Throwing stays the caller's business: an error
created and returned is a value, not a failure.

## 3. `capture` — a payload worth keeping, and its shape

**Before.** Keeping a request or a response means printing it, or writing bespoke redaction at the
call site, and the size of what is kept is a decision buried in `JSON.stringify`:

```ts
this.log?.debug?.({req: {method, url}, headers, body}, 'http exchange');
```

**With lukaot**, a capture is declared once with the **shape** that renders it, and the call site
asks for a rung of it:

```ts
this.capture?.http?.({method: verb, phase: 'request'}, () => exchange);
```

The payload is a **thunk**, so a rung that does not need it never builds it. Three shapes ship, each
with its own rungs, cheapest first:

| Shape           | Rungs                                | What a rung keeps                                    |
| --------------- | ------------------------------------ | ---------------------------------------------------- |
| `http.exchange` | `line` → `headers` → `body` → `full` | the request/premise line, then headers, then body    |
| `tcp.frame`     | `line` → `hex` → `full`              | the frame's line, then its bytes                     |
| `json`          | `line` → `keys` → `body`             | the document's summary, then its keys, then its body |

The mask is a **floor**, additive and never subtractive: `authorization`, `cookie`, `set-cookie`,
`proxy-authorization` and `x-api-key` are hidden whatever a scope configures, and a scope may add
paths of its own but cannot ask for one back. The shapes ship as the framework's own declarations
(`frameworkHttpExchange`, `frameworkTcpFrame`, `frameworkJsonPayload`), so the surface is keyed by
shape family — `.http`, `.tcp`, `.json`.

**A payload is something an operator asks for**, so the framework declares its three captures
`enabled: false` and a process turns one on where it wants it:

```yaml
log:
    capture:
        frameworkHttpExchange:
            enabled: true
            level: headers # line → headers → body → full; the declaration's is the default
```

The configuration has the last word and the declaration is the default it starts from:
`enabled: true` here runs a capture declared off, `enabled: false` silences one declared on, and
naming a capture without either flag is the ask — it runs. The policy is read when the log is built,
so a change takes effect on the next start rather than mid-run.

**Scope it to one adapter instance.** The grain that matters operationally is the instance, not the
adapter type: a deployment turns a payload on for the one adapter it is debugging, and every other
instance of the same adapter pays nothing — not a thunk call, not a rendered shape. A `when` block
selects on three identities, each a glob or a list of them:

```yaml
log:
    capture:
        frameworkHttpExchange:
            enabled: true
            level: body
            when:
                instance: [srv.http] # <realm>.<layer> — the port the call went through
                method: ['chat.*', 'db/**'] # $meta.method of the operation
                phase: [request, response] # which half of the exchange
```

`instance` is the id the framework assembles the port with, `<realm>.<layer>` — `srv.db`,
`srv.subject`, `login.loginDispatch` — which is also the `context` the record carries, so a line in
the log names the instance that produced it. A component that takes a capture itself, without a
port, reports its class name there instead (`Watch`, `Gateway`). A glob selects a group of
instances: `srv.*` is one realm's adapters, `*.http` is the http adapter wherever it runs. An unset
field matches everything, and a capture that matches nothing on its instance never reaches the
payload.

**Or give each instance its own rule.** A key under `when` is an instance id (a glob works), and its
value is the rule for that instance: `true` for everything it does, `false` for nothing, or an
object narrowing `method`/`phase` and raising `level` or adding a `mask`:

```yaml
log:
    capture:
        frameworkHttpExchange:
            enabled: true
            when:
                srv.http: true # everything this one does, at the policy's rung
                srv.db: false # nothing, whatever the policy says
                'srv.*': {method: ['chat.*'], level: headers} # the rest of the realm
                '*': {phase: [response]} # and everything else, one half only
```

Writing the keys is what makes the list the rule: an instance that matches none of them takes no
capture, and `'*'` is how a configuration says "the rest". The most specific match decides — a
literal id beats a glob, and a longer glob beats a shorter one, so `srv.http` wins over `srv.*`,
which wins over `*`. The flat `instance`/`method`/`phase` fields are the shorthand for the
single-instance case; beside keys they are not consulted.

## 4. `decision` — a choice, and the arms it offers

**Before.** A branch is an `if`. What it weighed and why it chose is invisible unless somebody wrote
a line about it, and the alternative it did not take is nowhere:

```ts
if (rate > rateLimit) return decline(rate);
return publish(rate);
```

**With lukaot**, the choice is declared with its arms, and the call passes predicates per arm:

```ts
decision: {
    rateWithinLimit: {
        message: 'whether a provider quotes the rate it was asked for',
        branch: {
            decline: 'the rate is above this provider limit',
            accept: 'the rate is quotable',
        },
    },
},
```

```ts
const accepted = decide(fxpVocabulary.decision.rateWithinLimit, {rate, rateLimit}, [
    {name: 'decline', when: v => (v.rate as number) > (v.rateLimit as number), run: () => false},
    {name: 'accept', when: () => true, run: () => true},
]);
```

| Field     | Type                       | Meaning                                                     |
| --------- | -------------------------- | ----------------------------------------------------------- |
| `message` | string                     | what the choice is about                                    |
| `branch`  | `{arm: note}`              | the arms it offers, each with the sentence that explains it |
| `enabled` | boolean, `true` by default | whether the rationale is recorded at all                    |

| Property                     | Guarantee                                                                   |
| ---------------------------- | --------------------------------------------------------------------------- |
| arms are a closed set        | an arm the declaration does not offer is a compile error at the call site   |
| evaluation order preserved   | `candidates` is the call's order, and the rationale can be replayed from it |
| control flow never changes   | `enabled: false` runs the arm anyway; only the recording stops              |
| a declared name is greppable | the discriminator on the record is `rateWithinLimit`, not a phrase          |

A bare string still works — `decide('some-name', values, arms)` — for code that has not declared its
decisions; the declaration is the improvement, not a requirement.

## Policy: one name, changed without the code

A realm configures levels, silence and sampling per identifier, under `lukaot.policy`. A key may be
an identifier or its **namespace** (the leading word), so `agent` sets a whole realm's default and
`agentTicketClaimed` overrides one name:

```yaml
lukaot:
    policy:
        agent: {level: debug}
        agentTicketClaimed: {sample: 0.1}
        agentAnswerWakeUnpublished: {enabled: false}
```

| Key       | Type    | Effect                                                       |
| --------- | ------- | ------------------------------------------------------------ |
| `enabled` | boolean | `false` emits nothing (an error signal is still constructed) |
| `level`   | level   | the level the record is written at                           |
| `sample`  | number  | the fraction of calls recorded                               |

A key that names no declared signal is **warned about** rather than ignored, because a policy
written for a renamed signal is otherwise a silent no-op somebody keeps believing in.

Captures are configured per **declared identifier** under the log block, with a selector so one
method's rung can differ from the rest:

```yaml
log:
    capture:
        frameworkHttpExchange:
            level: body
            when: {method: 'gateway.*'}
            mask: {paths: [{at: 'headers.x-tenant'}]}
```

## What a record carries

Every kind lands in the same record shape, which is why one reader serves all four. The identity is
the declared name, and the values the call supplied sit beside it:

```json
{
    "id": "01J8Z9K2M9…",
    "signal": "fxpRateDeclined",
    "level": 40,
    "levelName": "warn",
    "service": "fxp",
    "msg": "rate declined: 1.2 above 1.15",
    "params": {"rate": 1.2, "rateLimit": 1.15},
    "flow": {"id": "01J8Z…", "kind": "transfer.single", "step": "quote", "leg": "quote.fx"},
    "refs": {"record": "lukaot://r/01J8Z9K2M9…", "template": "lukaot://t/…"}
}
```

On stdout the same record is one line — level, service, message, then the identity and the values —
and a folded or failure line carries the `lukaot://` references a reader follows afterwards:

```bash
blong-dev log 01J8Z9K2M9…            # one entry in full
blong-dev log --level warn --name fxp  # recent warnings from a run that has finished
```

The service (when one is configured) keeps a **ledger per identifier** — count, first and last seen,
the level it was written at — plus exemplars, the causal index, the flow ledger and search. There is
no per-occurrence corpus: records are evidence held for a while, and what is durable is the name.

## Running the fixtures

The two topologies in `core/lukaot/flow/` run over real HTTP and declare a vocabulary per
participant. They are the end-to-end evidence, and the [flow walkthrough](./lukaot-flows.md) draws
what a run produced.

```bash
cd core/lukaot

node flow/run.ts --flow single                    # four participants, offline
node flow/run.ts --flow inter                     # six, through the cross-border proxy
node flow/run.ts --flow single --fault declineRate
node flow/run.ts --flow single --service http://127.0.0.1:9455
```

The runner validates its arguments, so a mistyped fault exits 2 with the usage line rather than
quietly running a fault-free flow that looks like a success. `--service` is a **second**
destination: records are retained locally either way, and `lukaot inspect` resolves a printed
reference afterwards.

`node --run ci-test` runs the fixtures' artifact test, which executes both topologies against an
in-process service and compares the rendered diagrams with the committed ones — regenerate with
`LUKAOT_UPDATE_DIAGRAMS=1 node test/flow/observedFlows.test.ts`.
