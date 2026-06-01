---
name: blong-docs
description: Understand, create, and maintain documentation in the Blong docs site (docs/blong/docs/). Docs are split into three tiers — rationale, concept, and pattern — with a strict separation of concerns between them. Use this skill whenever writing a new doc, splitting an existing one, or reviewing a doc to decide what tier it belongs to.
---

# Blong Documentation Maintenance

## Overview

The Blong documentation site lives at `docs/blong/docs/`.  Documentation is
organised into three tiers that serve different audiences and purposes:

| Folder        | Purpose                                                  | Audience          |
| ------------- | -------------------------------------------------------- | ----------------- |
| `rationale/`  | **Why** — the problem, the design decisions, the trade-offs | Architects, senior developers |
| `concepts/`   | **What** — high-level description of a feature or idea   | All developers    |
| `patterns/`   | **How** — detailed implementation examples and config reference | Implementers |

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
instructions.  Those belong in the pattern doc.

**Length:** Typically 300–800 words.  Use headings to separate the problem, solution,
and trade-off sections.

**Example files:**
- [goals.md](../../../docs/blong/docs/rationale/goals.md) — why Blong exists
- [error-proxy.md](../../../docs/blong/docs/rationale/error-proxy.md) — why errors use a proxy instead of imports
- [schema-sync.md](../../../docs/blong/docs/rationale/schema-sync.md) — why declarative schema management

---

### Concepts (`concepts/`)

**Answers the question:** "What is this feature and what does it do?"

A concept document covers:
- A **one-paragraph** summary of what the feature is.
- The **key behaviours** in a short bullet list or numbered list (3–6 items).
- Links to the corresponding **pattern** (how to implement) and **rationale** (why it exists).

A concept doc does **not** contain configuration field tables, code listings longer than
5 lines, or step-by-step instructions.  It is a map, not a territory.

**Length:** Typically 100–250 words.  The goal is to give a reader enough orientation to
decide whether to read the pattern doc.

**Example files:**
- [adapter.md](../../../docs/blong/docs/concepts/adapter.md) — what an adapter is
- [errors.md](../../../docs/blong/docs/concepts/errors.md) — what the error system does
- [schema-sync.md](../../../docs/blong/docs/concepts/schema-sync.md) — what declarative schema management does

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

**Length:** As long as necessary.  Use headings and tables liberally.

**Example files:**
- [adapter.md](../../../docs/blong/docs/patterns/adapter.md) — adapter config reference and code examples
- [handler.md](../../../docs/blong/docs/patterns/handler.md) — handler implementation patterns
- [schema-sync.md](../../../docs/blong/docs/patterns/schema-sync.md) — schema management config and examples

---

## Writing a new doc

1. **Determine the tier** first.
   - If you are explaining *why* a decision was made → `rationale/`.
   - If you are describing *what* a feature is at a high level → `concepts/`.
   - If you are showing *how* to use a feature → `patterns/`.

2. **Check for an existing doc** in the target folder.  If one exists, update it rather
   than creating a new file.

3. **Link between tiers.**  The concept doc should link to the pattern doc and rationale
   doc.  The pattern doc should link back to the concept doc.

4. **File naming:** use kebab-case, matching the feature name.  If the same feature appears
   in all three tiers the file name should be identical across folders
   (e.g. `schema-sync.md` in all three).

---

## Reviewing an existing doc

When a doc has grown too long or mixes concerns:

1. Read the doc and categorise each section by tier (rationale / concept / pattern).
2. Create the missing tier files.
3. Move content to the appropriate file.
4. Replace moved content in the source file with a one-sentence summary and a link.

**Smell: a concept doc with config tables** → move the tables to the pattern doc.
**Smell: a pattern doc that explains design decisions** → move the explanation to rationale.
**Smell: a rationale doc with code examples** → move the examples to the pattern doc.

---

## Cross-references

Standard link patterns:

```markdown
<!-- From concept doc, pointing to pattern and rationale -->
See the [pattern guide](../../../docs/blong/docs/patterns/my-feature.md) for full configuration examples.
See the [rationale](../../../docs/blong/docs/rationale/my-feature.md) for design motivation.

<!-- From pattern doc, pointing back to concept -->
See the [concept overview](../../../docs/blong/docs/concepts/my-feature.md) for a high-level description.
```

---

## Docusaurus conventions

The docs site uses [Docusaurus](https://docusaurus.io/).

- Each folder contains a `_category_.json` that sets the sidebar label and position.
- Do not add front-matter (`---`) to doc files unless you need a custom title or slug.
- Images go in the `concepts/img/` folder (by Docusaurus convention for the site).
- The site is built by `npm run build` inside `docs/blong/`.
