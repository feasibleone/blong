# Kukum — why the framework generates its own primitives

## The problem

Blong's skills describe, in prose, what a handler, a schema, a seed or a realm should look like.
That prose is the contract, but it is not executable, and three things went wrong because of it.

**Agents transcribed the recipes and drifted.** Copying a folder layout out of a skill by hand
produces plausible-looking files with a kebab-case realm name (which cannot work — `$subject` is
substituted into identifiers), an `add` handler in the `adapter` layer, an invented predicate where
`get` already existed, and a shared file overwritten so the entity added yesterday disappeared. None
of these fail loudly; they fail later, in a test in someone else's realm.

**The recipes were duplicated in code.** `blong-kopi` implements the realm recipe imperatively in
`createRealm`. A second copy was needed for realms, but a third for schemas and a fourth for seeds
would each have to be maintained in lockstep with the skills they mirror, with no shared validation
and no way to ask what exists.

**Nothing could describe the running system.** There was no way to ask which layers the current
intent activated, which handlers a process had mounted, or which artifacts still carry unfinished
instructions. An agent had to read the source and guess.

## The approach

Model every recipe as **declarative data** and derive everything else from it.

A **descriptor** is a record: an identifier, the kinds it supports, the skill that owns its prose,
the roots `find` should scan, a pure function from context to files, an optional merge-aware
variant, and an optional set of guardrails. One catalogue file lists them. The API surface is then
generated — routes, gateway validation entries and CLI support all come from iterating the catalogue
times the standard predicates, so no list of methods is written by hand and none can fall out of
date.

The **engine** is pure and host-injected: it plans and applies file changes against an abstract host
that the running realm satisfies with `this.platform` and the CLI satisfies with `node:fs`. One
implementation, three entry points, and the planning logic unit-testable without a filesystem.

Two consequences matter more than they first appear. Because a descriptor names its owning skill,
the API becomes a _pointer into_ the documentation rather than a copy of it — `primitive.find`
returns the skill name so an agent can be sent to the prose. And because the guardrails are
executable, a rule that used to be advice in a document is now a hard error before a single byte is
written.

## Trade-offs

**Descriptors are not `library()` handlers.** They are data plus pure functions with nothing to bind
to a runtime, so wrapping them would add them to the dispatch graph for no benefit.

**`auto` composes; `replace` is opt-in.** The safer default is the slower one, but silently dropping
a previously declared entity to save a merge helper is not a trade worth making. When a composer
cannot recognise the file it was handed, it warns and overwrites rather than guessing.

**Hand-written files are refused, not merged.** Merging into a file a human edited is guesswork, so
only files carrying the generated marker are considered machine-owned. The rest are reported, and
`--force` remains available for the deliberate case.

**Tests never update their own baselines.** Generation and baseline refresh live in a separate
command (`kukum:fixture:update`) that a human runs and reviews. A test that regenerated its
expectations would assert nothing; keeping them apart is what makes the committed Playwright
screenshots evidence that the generated UI did not move.

## Design principles

- **The catalogue is the source of truth.** Derive the surface; never enumerate it twice.
- **Never silently destroy.** Compose when possible, refuse hand-written files, warn when replacing.
- **Validate before writing.** A guardrail that only exists in prose is not a guardrail.
- **Keep the engine pure.** No runtime, no globals; the host is an argument.
- **Point at the documentation.** A descriptor names its skill instead of restating it, so the
  generated artifact and the prose stay recognisably the same thing.

See the [concept](../concepts/kukum.md) for what kukum is and the
[pattern guide](../patterns/kukum.md) for the endpoint reference and the maintenance recipes.
