# Lukaot

> lukaot = look out in [Bislama](https://en.wikipedia.org/wiki/Bislama)

**lukaot** is one declared vocabulary for everything a process reports: the lines it logs, the
errors it throws, the payloads it captures, and the choices it makes. A name is written once, in a
file beside the code, and a call site reaches it as a function instead of composing a sentence.

```ts
export default declare({
    log: {fxpRateDeclined: {level: 'warn', message: 'rate declined: {rate} above {rateLimit}'}},
});
```

```ts
this.signal?.fxpRateDeclined?.({rate, rateLimit});
```

Four kinds, one mechanism:

| Kind         | A declaration names                    | The call site does                              |
| ------------ | -------------------------------------- | ----------------------------------------------- |
| **log**      | a line the component reports           | `signal?.<id>?(…)` — writes a record            |
| **error**    | a failure and its answer to the caller | `throw errors.<id>(…)` — constructs and records |
| **capture**  | a payload worth keeping, and its shape | `capture?.http?.(selector, () => payload)`      |
| **decision** | a choice and the arms it offers        | `decide(vocabulary.decision.<id>, values, …)`   |

What the declaration buys is the same for all four: the **name is the identity** on the record, so
it is greppable from the code that emitted it; an operator can raise, silence or sample one name in
configuration without touching the code; and a name exists before any run, so counting, review and
diagrams work on names rather than on text.

- How to declare and use it: [pattern guide](../patterns/lukaot.md)
- Two flows drawn from a real run: [flow walkthrough](../patterns/lukaot-flows.md)
- Why it is shaped this way, and what it replaced: [rationale](../rationale/lukaot.md)
