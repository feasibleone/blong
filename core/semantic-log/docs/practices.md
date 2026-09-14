<!-- cspell:ignore EADDRINUSE kindless ONNX SIGSEGV -->

# semantic-log — practices

What building this package taught, distilled to what a future change should do. These are not style
preferences: each one is the counter-measure to a defect class that got through review here. Read
[decisions.md](./decisions.md) for why the code looks as it does, and
[open-items.md](./open-items.md) for what is still unfinished.

**The dominant failure mode was a mechanism that could never fire** — code that runs, passes its
tests, and cannot possibly do its job. It appeared repeatedly and in unrelated shapes: an off-by-one
that recorded four of five baseline windows; a comparison against a property that did not exist, so
always `false`; drift fed a vector that could never vary; a duplicate-header guard against a value
the HTTP parser never delivers; an assertion that passed when the record was _absent_; an option
applied verbatim to every participant so any non-zero value was `EADDRINUSE`. Nothing about a green
suite distinguishes these from working code.

## Prove the mechanism can fire

- **Re-inject the bug and watch the suite go red for that reason.** An assertion added without this
  step is a claim, not a test. Every fixed Critical in this package was confirmed this way.
- **Check the test count before believing a red run.** `tap` dies by SIGSEGV intermittently in this
  package; the signature is a count _lower_ than the suite's (`1..0 # no tests found` for one file),
  which reads as a failure and is not one. Re-run before investigating.
- **Falsify the wiring, not just the unit.** A detector, guard or route can be fully unit-tested and
  still be dead in production because nothing feeds it. Ask what calls this, and what feeds that.

## Assert against what the run produced

The flow fixtures read records back **out of each participant's own cache** and assert on those. A
test that constructs the object it then verifies cannot fail, and it hides a broken mechanism behind
a passing suite. The same rule caught the defects a hand-built fixture would have masked.

## Know what the coverage gate sees

- `tap` gates at **100%** and reports a **line**, never a branch, printing its table only on
  failure. To find a shortfall, read `.tap/report/lcov.info` — `LF/LH` and `BRF/BRH` per file —
  instead of guessing.
- **It cannot see an untaken `??` or `?.` side**, and it says nothing about whether a value that was
  written is ever read. Those forms need an explicit assertion.
- A module the globs miss is silently uncovered, so after adding one, confirm its counters in lcov
  rather than trusting the exit code.

## The runtime is the authority, not the type-checker

`tap` loads TypeScript through SWC, which _transforms_ it; `tsc` _accepts_ it. Bare Node 24 only
_strips_ types, so parameter properties, `enum`, `namespace` and decorators pass both gates and fail
at load. That is why `test/strip-types.test.ts` exists, and why it loads the **package root** and
every shipping module rather than a curated list: the list omitted the offender, whose parameter
property was written across two lines and so was invisible to the obvious grep.

## Read exit codes — never through a pipe

`cmd | tail -40; echo $?` reports the status of `tail`. `node --run test` exits **1** on a coverage
shortfall while printing a full pass count, so a report that quotes only the count can be green
about a red run. Redirect to a file and read `$?` directly.

## Editing structured files

- **One edit per file per message.** Batched edits against the same file are applied at offsets
  computed against the pre-batch text, so a later one can splice into an unrelated paragraph.
  Batching across _different_ files is safe.
- **When a heading is the anchor, repeat it in the replacement.** Replacing a heading with body
  prose silently re-parents everything below it. Grep the file's headings after editing it — that is
  what caught this, three times.
- **Verify a write happened.** A tool can report success without changing the file: grep for a
  distinctive phrase from the new text before trusting it.

## Working from a brief or a plan

- **A brief is a design intent and a file list, not code to paste.** Check the shipped signature of
  everything a snippet calls — a flow call carries both identities, a fastify handler must set the
  status on the reply or the failure never leaves the participant, and the logger's second argument
  _is_ the field bag (wrapping it in `{fields: …}` stores it where nothing reads it).
- **When a brief's own test contradicts its own code, the test is the contract** — and a
  contradiction worth stopping over is worth saying out loud rather than resolving quietly.
- **Escalate rather than invent.** The worst defects here came from closing a gap with something
  plausible: a per-template drift marker for a template that cannot drift, a fabricated `flow.id` of
  `'unnamed'`, an `available: true` branch whose alternative could never be taken. If the surface a
  requirement needs does not exist, say so and stop; a requirement that _reads_ as satisfied while
  being structurally dead is worse than a red build.

## Ownership and copying

**Copying a container is not copying its contents.** This package hit the same aliasing defect four
times (a store returning a caller's array, a cache handing out internal storage, an index returning
its own nodes, a tracker its own vector). The registry copies its centroid on store for exactly this
reason, and a reviewer who re-derives a caller chain beats an implementer's assumption about where a
value came from.
