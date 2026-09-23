---
name: blong-docs
description:
    Understand, create, and maintain documentation in the Blong docs site (docs/blong/docs/). Docs
    are split into three tiers — rationale, concept, and pattern — with a strict separation of
    concerns between them. Use this skill whenever writing a new doc, splitting an existing one, or
    reviewing a doc to decide what tier it belongs to.
---

# Blong Documentation Maintenance

## Overview

The Blong documentation site lives at `docs/blong/docs/`. Documentation is organised into three
tiers that serve different audiences and purposes:

| Folder       | Purpose                                                         | Audience                      |
| ------------ | --------------------------------------------------------------- | ----------------------------- |
| `rationale/` | **Why** — the problem, the design decisions, the trade-offs     | Architects, senior developers |
| `concepts/`  | **What** — high-level description of a feature or idea          | All developers                |
| `patterns/`  | **How** — detailed implementation examples and config reference | Implementers                  |

Keeping the tiers separate ensures:

- Concept docs stay short enough to read in under 2 minutes.
- Pattern docs contain only the details needed to implement — no philosophy.
- Rationale docs explain the thinking so future contributors can make consistent decisions.

---

## Tier definitions

### Rationale (`rationale/`)

**Answers the question:** "Why does this exist and why is it designed this way?"

A rationale document covers:

- The **problem** being solved (what went wrong without this feature).
- The **solution approach** and why this approach was chosen over alternatives.
- **Trade-offs** — what was explicitly rejected and why.
- **Design principles** that governed the decisions.

A rationale doc does **not** contain configuration examples, API tables, or step-by-step
instructions. Those belong in the pattern doc.

**Length:** Typically 300–800 words. Use headings to separate the problem, solution, and trade-off
sections.

**Example files:**

- [goals.md](../../../docs/blong/docs/rationale/goals.md) — why Blong exists
- [error-proxy.md](../../../docs/blong/docs/rationale/error-proxy.md) — why errors use a proxy
  instead of imports
- [schema-sync.md](../../../docs/blong/docs/rationale/schema-sync.md) — why declarative schema
  management

---

### Concepts (`concepts/`)

**Answers the question:** "What is this feature and what does it do?"

A concept document covers:

- A **one-paragraph** summary of what the feature is.
- The **key behaviours** in a short bullet list or numbered list (3–6 items).
- Links to the corresponding **pattern** (how to implement) and **rationale** (why it exists).

A concept doc does **not** contain configuration field tables, code listings longer than 5 lines, or
step-by-step instructions. It is a map, not a territory.

**Length:** Typically 100–250 words. The goal is to give a reader enough orientation to decide
whether to read the pattern doc.

**Example files:**

- [adapter.md](../../../docs/blong/docs/concepts/adapter.md) — what an adapter is
- [errors.md](../../../docs/blong/docs/concepts/errors.md) — what the error system does
- [schema-sync.md](../../../docs/blong/docs/concepts/schema-sync.md) — what declarative schema
  management does

---

### Patterns (`patterns/`)

**Answers the question:** "How do I implement this?"

A pattern document covers:

- **Full code examples** — complete, copy-paste-able snippets.
- **Configuration reference tables** — all fields, types, defaults, and descriptions.
- **Type mapping tables** (e.g. TypeBox → SQL column types).
- **Folder / file naming conventions** for the feature.
- **Override or extension patterns** — how to customise the default behaviour.
- **Test patterns** — how to verify the feature works.

A pattern doc does **not** contain philosophical discussion or design rationale.

**Length:** As long as necessary. Use headings and tables liberally.

**Example files:**

- [adapter.md](../../../docs/blong/docs/patterns/adapter.md) — adapter config reference and code
  examples
- [handler.md](../../../docs/blong/docs/patterns/handler.md) — handler implementation patterns
- [schema-sync.md](../../../docs/blong/docs/patterns/schema-sync.md) — schema management config and
  examples

---

## Writing a new doc

1. **Determine the tier** first.
    - If you are explaining _why_ a decision was made → `rationale/`.
    - If you are describing _what_ a feature is at a high level → `concepts/`.
    - If you are showing _how_ to use a feature → `patterns/`.

2. **Check for an existing doc** in the target folder. If one exists, update it rather than creating
   a new file.

3. **Link between tiers.** The concept doc should link to the pattern doc and rationale doc. The
   pattern doc should link back to the concept doc.

4. **File naming:** use kebab-case, matching the feature name. If the same feature appears in all
   three tiers the file name should be identical across folders (e.g. `schema-sync.md` in all
   three).

---

## Reviewing an existing doc

When a doc has grown too long or mixes concerns:

1. Read the doc and categorise each section by tier (rationale / concept / pattern).
2. Create the missing tier files.
3. Move content to the appropriate file.
4. Replace moved content in the source file with a one-sentence summary and a link.

**Smell: a concept doc with config tables** → move the tables to the pattern doc. **Smell: a pattern
doc that explains design decisions** → move the explanation to rationale. **Smell: a rationale doc
with code examples** → move the examples to the pattern doc.

---

## Cross-references

Standard link patterns:

```markdown
<!-- From concept doc, pointing to pattern and rationale -->

See the [pattern guide](../../../docs/blong/docs/patterns/my-feature.md) for full configuration
examples. See the [rationale](../../../docs/blong/docs/rationale/my-feature.md) for design
motivation.

<!-- From pattern doc, pointing back to concept -->

See the [concept overview](../../../docs/blong/docs/concepts/my-feature.md) for a high-level
description.
```

---

## Visual content

A diagram is often the shortest way to say what a page is for, and a screenshot is the only way to
show a UI feature. Prefer a **mermaid block written inline in the page** over a rendered image: the
docs site has the mermaid theme enabled, and a mermaid block is theme-aware, translatable,
searchable and reviewable in a diff. Reach for an image only for a real screenshot.

### Generated vs hand-written

Two kinds of visual live side by side, and the difference matters when you edit a page:

| Kind             | Where it comes from                                                                                                                       | How you change it                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Generated**    | A test or script renders it: sequence diagrams from a real run, screenshots from Playwright, architecture diagrams from the live registry | Edit the **generator** or the code it reads, then regenerate. Never edit the file by hand. |
| **Hand-written** | Authored mermaid written into the page while reading the code and the surrounding docs                                                    | Edit the markdown, the same as prose.                                                      |

Generated artefacts are committed to the repository and refreshed on demand, so the docs build stays
a plain Docusaurus build. The register is
[`docs/blong/docs-artifacts.json`](../../../docs/blong/docs-artifacts.json) — one entry per artefact
with its destination, the package its generator runs in, and the command that regenerates it.

```bash
blong-dev docs list                  # the register, and whether each destination exists
blong-dev docs generate [--only id]  # run the generators and write the artefacts
blong-dev docs check                 # regenerate, compare, restore; non-zero when stale
```

Run `blong-dev docs check` before you call a docs change done, and commit the diff if it reports an
artefact as stale. It restores what it found, so it is safe on a dirty tree.

### Marker convention

A generated block that lives **inside** a page is written between a marker pair, so the generator
knows exactly which region to own and a reviewer can see what is generated:

```markdown
<!-- BEGIN GENERATED: <artefact-id> -->

… generated content …

<!-- END GENERATED: <artefact-id> -->
```

An update replaces only what a person already marked. It never _creates_ the region — which heading
the block belongs under is an editorial decision — so when you add a generated block to a page,
write the marker pair and the surrounding prose yourself, then run `blong-dev docs generate`. Some
existing artefacts use a more specific marker (`OBSERVED FLOWS: transfer.single`); the register
records the exact one per entry.

### Verifying diagrams

A mermaid diagram is parsed in the **browser**, not at build time, so a broken one compiles, serves
and passes every test — the reader just sees an error box where the picture should be. Check them in
a real browser before calling the work done:

```bash
cd docs/blong && npm run build   # the check serves the built site
blong-dev docs verify            # every diagram on every page
blong-dev docs verify --filter 'concepts/*' --json
```

`docs verify` counts the diagrams each page owes from the markdown, then counts what actually drew,
so a block that failed to parse is reported as `drew 1 of 2` rather than quietly missing. It also
checks that **every image on the page loaded** — `onBrokenLinks: 'throw'` guards links, not
pictures, so a reference to a file that was never committed builds clean and shows the reader a
broken-image icon. It is what `rush ci-docs` runs, so either defect fails CI instead of shipping.

Two habits that avoid most breakage, both learned the hard way:

- **No backticks in a mermaid label.** Mermaid reads a backtick as a markdown-string delimiter, and
  more than one pair inside a quoted label is a lexical error. A diagram label reads fine without
  them.
- **Keep labels plain.** No backslash-escaped quotes — write the label with single quotes, or none.
- **A dark/light picture pair is written with the `#gh-dark-mode-only` and `#gh-light-mode-only`
  fragments**, as `concepts/architecture.md` and `concepts/adapter.md` do. Docusaurus does not
  implement that by itself — the site does it in `docs/blong/src/css/custom.css`, which hides
  whichever image does not match the reader's theme with `display: none`. Two consequences worth
  knowing: both `<img>` elements are always in the DOM, and a theme-hidden image is never fetched,
  so a check that judges images must only judge the ones that are actually rendered.

### Images

Site-wide assets (favicon, logo, social card) live in `docs/blong/static/img/`. Images a **page**
embeds live next to the tier that shows them:

- `docs/blong/docs/concepts/img/`
- `docs/blong/docs/patterns/img/`
- `docs/blong/docs/rationale/img/`

Reference them relatively (`![alt](./img/name.png)`), and always write real alt text — it is the
only description a reader gets when the image does not load. A screenshot is captured by a dedicated
docs-only Playwright spec writing straight into the tier's `img/` folder, so the picture and the
page are reviewed together:

```bash
BLONG_CAPTURE_DOCS=1 node --run playwright -- test/docs.play.ts
```

Two exist today and are the worked examples: `demo/blong-marine/test/docs.play.ts` (generated Browse
and Editor pages) and `realm/blong-access/test/docs.play.ts` (the ACL Rules table and a role's
Access tab). Both sit directly in the package's `test/` folder; a package with many specs may group
them under `test/docs/` instead, since the runner's match is `**/*.play.ts`.

The cheapest capture is one you do not have to write: `openPages` takes a `docs` name and a
`docsOnly` flag, so a realm that already lists its pages can publish a picture of each from the same
navigation its baseline uses — and with `docsOnly` it adds no new snapshot files.

Without `BLONG_CAPTURE_DOCS=1` the same spec still runs as a smoke test and writes nothing, so a CI
run never overwrites a committed picture. Make a capture deterministic before committing it: pin the
rows with a search term, mask the minted ids and clocks, and clip to the element the page is about.

---

## Docusaurus conventions

The docs site uses [Docusaurus](https://docusaurus.io/).

- Each folder contains a `_category_.json` that sets the sidebar label and position.
- Do not add front-matter (`---`) to doc files unless you need a custom title or slug.
- The site is built by `npm run build` inside `docs/blong/`. The build fails on a broken link
  (`onBrokenLinks: 'throw'`), so it is the real check that a new link or image reference resolves.
