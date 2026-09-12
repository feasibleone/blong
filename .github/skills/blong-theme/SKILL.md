---
name: blong-theme
description: Implement, extend, design-match, or debug a blong-browser visual theme variant — the `glass` / `wood` style CSS layers applied on top of a PrimeReact base theme (canvas, cards, inputs, buttons, checkboxes, tables, portal overlays, generated textures). Use this skill whenever adding a new variant (e.g. brass, leather, carbon), matching a variant to reference screenshots or a mockup, restyling PrimeReact overlays or focus states, synthesising theme textures, or when a variant rule "isn't applying" — even if the user just says "add a theme", "make it look like this design", or "the caret/border/focus is broken". For the components and pages themselves use blong-browser; for Storybook setup use storybook-v10-setup.
---

# blong-theme Skill

Turn a design reference into a selectable blong-browser theme variant that holds up in every app,
in every environment, without breaking the base PrimeReact themes.

A variant is a **layered imitation of a real material** — it is judged by eye against a design
capture, so the workflow is measurement-driven, not CSS-guessing. The `wood` variant is the
worked example and the source of every rule below; see
[references/wood-theme.md](./references/wood-theme.md).

## [CRITICAL_GUARDRAILS]

1. **Scope every rule to the variant class.** In-tree elements are under `.blong-app-<variant>`;
   body-portal overlays (dropdowns, hints, confirm popups) mount *outside* it and only see the
   `blong-theme-<variant>` marker on `document.documentElement`. Never style a bare `.p-*` class.
2. **PrimeReact v10 keeps structural CSS in `@layer primereact`; the base theme CSS is unlayered.
   Unlayered wins — but a shorthand like `border: solid transparent` silently resets geometry the
   structural sheet set.** Any geometry the variant must own has to be restated unlayered with
   `!important`. Read [references/prime-react-cascade.md](./references/prime-react-cascade.md)
   before fighting a caret/border that "won't apply".
3. **Focus is `outline`, never `box-shadow`.** Any control whose variant rule sets
   `box-shadow: … !important` has already lost its PrimeReact focus ring; repainting it with a
   shadow joins the war you cannot win. Also: `--focus-ring` is *not* consumed by the vendored
   `vela-blue` base theme — it hard-codes `#93cbf9`.
4. **Measure, never eyeball.** Sizes come from ink bounding boxes and run scans of the capture,
   not from "looks about right". Soft edges are converged by comparing their **decay profile**,
   not a single peak sample.
5. **Never read `getComputedStyle().borderWidth` as an authored value.** The reporting browser runs
   at `devicePixelRatio = 0.9` and Chrome snaps borders to whole device pixels. Judge borders
   visually; compare typography numerically (fonts and paddings are *not* snapped).
6. **One edge, one painter.** If CSS paints a `border`, the generated art must not also paint a
   rim (and vice versa) — the edge is then twice as thick as the design, which is exactly the
   "still too thick" bug. Enumerate every layer that paints at an edge before tuning any of them.
7. **Textures are authored at 2× and drawn at half size**, and each is either seamless in both
   axes or a 1-D profile uniform along the other axis — otherwise it cannot stretch to arbitrary
   sizes. See [references/textures.md](./references/textures.md).
8. **Do not chase a pixel-exact detail more than twice.** If a shape resists after two reasoned
   attempts, present a *simplification* and get an explicit product decision. This is what finally
   settled the wood caret (solid brass instead of a rim + interior). A decision made this way is
   binding: never "restore" it without asking.
9. **Record as you go.** Design decisions → `.github/memory/decision.md`; anything that cost
   unexpected effort → `.github/memory/friction.md`; anything deferred → `.github/memory/todo.md`;
   durable variant facts → `/memories/repo/theme-variants.md`. Also fix *code comments* that the
   work has just made false — three of them were found lying about asset delivery and cascade
   behaviour, and each would have misled the next session.

## What a variant is

Three layers, composed in this order:

```
primereact/resources/themes/<family>/theme.css   loaded as TEXT into <style id="blong-prime-theme">
  → <variant>-assets.css                         generated textures as --<variant>-* custom props
    → <variant>.css                              the variant's own rules (the bulk of the work)
```

`Theme.tsx` renders:

```html
<div class="blong-app blong-app-<palette> blong-app-<type> blong-app-<variant>">
```

and adds `blong-theme-<variant>` to `document.documentElement` for as long as the variant is
active. That marker is the **only** way to reach portal overlays — reuse it, and expose the
variant's type token on it too (`--<variant>-font` etc.), because portal content cannot inherit
from the wrapper.

## Procedure

### 1. Blueprint the material

Write `plans/theme/<variant>.md` describing the material in the design's own terms (what is
wood, what is steel, which parts are lit). Put the design captures in `plans/theme/`. If there is
no capture, say so and get one — a variant cannot be "matched" against a verbal description.

### 2. Establish the capture scale before measuring anything

A design PNG is almost always a **DPI-2 capture** and nothing in the file says so. Derive the
scale from a control whose CSS size you know (a 68 px-tall input ⇒ 34 CSS px ⇒ 2×), and only then
read metrics off it. Getting this wrong produced a full wasted round of "too thick"/"low-res"
corrections on the wood theme.

### 3. Inventory the surfaces

Split the design into numbered, non-overlapping surfaces and keep the numbering stable — the wood
theme uses `§W1` canvas … `§W8` toolbar keys, and those tags appear in `wood.css`, in
`woodAssets.mjs`, in `decision.md`, and in the user's own messages. Anchor the inventory in the
CSS file header so the next agent can navigate the file. Include a **tombstone** section for
anything deliberately not styled rather than leaving a silence.

### 4. Wire the variant

See **Variant contract** below. Do this before styling — a variant that cannot be selected cannot
be iterated on. Then open the Storybook story for it (port 6006 in this workspace) and iterate
against the live page.

### 5. Build surfaces outside-in, one at a time

Canvas → plates → inputs → controls → tables → inspector → toolbar → overlays. For each: measure
the design, write the rule, then **verify against the design at matched scale** with the harness
recipes in [references/design-match.md](./references/design-match.md), and report the numbers.
Change one variable per iteration; two changed at once produced two no-op rounds on the card
bevel.

### 6. Synthesise textures only for what CSS cannot do

Organic grain and woven mesh cannot be done in CSS; everything else can, and CSS scales better.
Follow [references/textures.md](./references/textures.md) — especially the calibration triple
(tone / `sdev` / high-frequency energy) and the tiling law. Keep all large-scale *tone* in CSS
(`background-color` + gradient) and pin the tile's mean to 128 so `overlay` blending is neutral.

### 7. Verify

- `npx vitest run` in `core/blong-browser` — all files, and add per-variant cases to
  `Theme.test.tsx`.
- A production-shaped build, plus Storybook dev/build and the package lib build if textures
  changed (the four-environment matrix in [references/textures.md](./references/textures.md)).
- Report the CSS payload before/after (raw + gzip) — a variant ships to every consumer.
- Confirm the variant is selectable in the switcher and that **the other variants and stock
  PrimeReact themes are unchanged**.

### 8. Record

Update the four memory files listed in guardrail 9, and add the variant to the inventory in
`/memories/repo/theme-variants.md` with its scoping rules and any measured constants.

## Variant contract

Adding a variant touches these files. TypeScript enforces two of them: extending the
`ThemeVariant` union makes the `VARIANT_CSS_CLASS` map fail to compile until it has an entry, which
is deliberate — use it.

| File | Change |
| --- | --- |
| `src/components/Theme/<variant>.css` | **new** — every rule scoped to `.blong-app-<variant>` and/or `.blong-theme-<variant>` |
| `src/components/Theme/<variant>-assets.css` | **generated** — only when the variant has textures; import it *before* the main CSS |
| `src/components/Theme/Theme.tsx` | add to the `ThemeVariant` union; add the `VARIANT_CSS_CLASS` entry (`<variant>: 'blong-app-<variant>'`); add the CSS imports; add any variant-specific effect next to the glass-reflection one |
| `src/components/Theme/themeRegistry.ts` | add to the `BlongThemeVariant` union; add a `Blong`-group entry `{id, label, variant}` (the switcher and the root marker are generic — nothing else to do) |
| `src/components/Theme/Theme.test.tsx` | add the "not applied by default" and "applied when `variant` is set" cases, plus the `name: '<variant>'` resolution case |
| `src/components/Editor/Editor.stories.tsx` | add a `<Variant>` story with `parameters = {theme: {variant: '<variant>'}}` |
| `scripts/<variant>Assets.mjs`, `package.json` | texture generator + a `theme:<variant>-assets` script (only if textures) |
| `.prettierignore` | add `**/<variant>-assets.css` when generated |

## Definition of done

- [ ] Selectable in the theme switcher; `blong-theme-<variant>` marker present while active.
- [ ] Every surface in the inventory styled, or explicitly tombstoned with a reason.
- [ ] Portal overlays styled from the root marker (dropdown panels, hint, confirm popup).
- [ ] Focus visible on **every** control, including ones with `!important` shadows (repaint with `outline`).
- [ ] Textures: seamless (verified), 2× authored / half drawn, format chosen per asset by measurement.
- [ ] No rule leaks to other variants or base themes — verified by eyeballing two others.
- [ ] Tests pass; dev build, production-shaped build and lib build all clean.
- [ ] CSS payload reported; generator is byte-reproducible across two runs.
- [ ] `decision.md` / `friction.md` / `todo.md` / repo memory updated.
- [ ] Stale comments disproved by the work are corrected.

## References

- [references/design-match.md](./references/design-match.md) — measuring captures, magnification
  harnesses, and how to get pixels back out of the browser.
- [references/prime-react-cascade.md](./references/prime-react-cascade.md) — v10 layer mechanics,
  caret/geometry resets, focus mechanics, CDP style inspection.
- [references/textures.md](./references/textures.md) — generator shape, tiling law, calibration
  numbers, format selection, asset delivery.
- [references/wood-theme.md](./references/wood-theme.md) — the worked example: surface inventory
  with the measured constants that were actually used.
