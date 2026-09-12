# Worked example: the `wood` variant

The first fully design-matched variant, and the source of every rule in this skill. Use it as a
template for structure and for the *kind* of decisions a variant needs — not as a source of values
for a different material.

- Design captures: `plans/theme/wood.png` (the app), `wood-card.png` (card plate), `wood-buttons-2.png`
  (toolbar keys). Blueprint: `plans/theme/wood.md`.
- `src/components/Theme/wood.css` (~1100 lines), `wood-assets.css` (generated), `assets/`
  (`wood-grain.png`, `wood-edge.webp`), `scripts/woodAssets.mjs` (~480 lines).
- Story: `Editor.stories.tsx` → `Wood`, `WoodTilt`, `WoodToolbar`.

## Surface inventory

The `§W<n>` tags are used consistently in the CSS header, the generator, `decision.md` and the
user's own messages. Copy this discipline.

| Tag | Surface | Key measured facts |
| --- | --- | --- |
| §W1 | Canvas | matte charcoal steel `#16171c`, faint 25 px engineering grid, radial top highlight |
| §W2 | Card plates | walnut `#4e3124` + 168° light gradient + grain tile `overlay`; `border: 1px solid #1d1310` **is the rim**; radius 6 px; `::after` = 9-slice `--wood-edge` bevel (`border: 16px solid transparent`, `border-image-slice: 32`, `border-image-width: 16px`) |
| §W3 | Inputs / dropdowns | recess `#100e0f` + `--wood-recess-top`, `--wood-recess-bottom`, `--wood-mesh` at `100% 4px, 100% 4px, 4px 4px`; radius 4 px; `border: 1px solid #0b0906`; focus = brass bezel (below) |
| §W4 | — | **tombstone**: in-card toolbar keys are the same component as the header's, so they share §W8 |
| §W5 | Checkboxes | box 22×22, frame 2 px, radius 3 px, socket `#211c19`; frame top `#ab9170`, flanks `#77604a`, **bottom re-lit `#8d7958`**; grid `repeat(4, 1fr)`, `gap: 1px 8px`, items `min-height: 22px` |
| §W6 | Datatable | fully transparent; header/rows `1.14rem`; header rule is a **groove** = `border-bottom: 1px solid #150c04` + `box-shadow: 0 1px 0 rgba(212,190,165,0.13)` |
| §W7 | Form inspector | walnut plate + **one continuous dark recess**; title is a *sibling* of the sections, so the plate is `display: flex; flex-direction: column` and `:last-child` gets `flex: 1 1 auto` — that is what makes the recess reach the bottom rail |
| §W8 | Toolbar keys | brass, panel = base colour + `--wood-btn-dots`; `border: 3px solid transparent` + `border-box` gradient; `height: 37px`, `box-sizing: border-box`; icon-only keys `width: 37px` ⇒ square |
| — | Popups | `.p-overlaypanel` rust `#a04f32`; `.p-confirm-popup` charcoal `#1f1f20`; both 3 px brass frame + dots + solid caret, scoped on `.blong-theme-wood` |

## Decisions worth reusing

**Rim ownership (§W2).** The card's 1 px CSS border *is* the rim, so the art must not paint one.
The art carries only the warm highlight, peaking at **+1.5 CSS px** and gone by **+3.0** —
`smoothstep(1.2,3.0)` rise × `smoothstep(3.0,6.0)` fall in art px, peak alpha 0.52, top-facing only
(`lit = max(0, −gy/gl)`). Two rounds of narrowing failed before this was found.

**Constant-thickness recess (§W3).** `no-repeat`-pinned 1-D ramps give the recess the same depth at
any input height, and `background` layers *are* clipped by `border-radius`, so the recess rounds
correctly for free. The bottom of a recess channel is a **light glare, not a shadow**.

**Sibling-aware plate (§W7).** The inspector needed one continuous recess across several sibling
sections. Flex column + `:last-child { flex: 1 1 auto }` + rounding only the first
(`0.95rem`-adjacent `6px 6px 0 0`) and last (`0 0 6px 6px`) section achieved it with a uniform
~11 px wood margin. `::after` was free for the 9-slice bevel — checked `src/design/index.css` for
other uses first.

**Square icon keys (§W8).** The design measures 74–75 device px for *every* key, icon-only
included. A fixed `height: 37px` with `box-sizing: border-box` plus `width: 37px` + inline-flex
centring + `padding: 0` on `.p-button-icon-only` is what makes them square; relying on padding made
them 33×39.

**Focus bezel (§W3).** The design's focused field is a ~3 px brass bezel, not a glow. Implemented
with per-side `border-*-color` + four directional `inset` shadows + a dark outer line and inner
lip, so the field does not change size on focus. The old `#b45309` + `0 0 10px` amber halo was
legacy palette. The dropdown trigger is transparent with **no divider** (one continuous channel),
chevron and clear `×` cream `#dfcbb6`.

**Solid caret (product decision).** Two attempts to reproduce the reference's brass *rim* around a
textured interior both read as patchy: the interior would have to redraw the panel's mesh, top
occlusion and `inset 0 0 0 1px #3a1608` seam at a different background origin, and the rim width
became a third thing to keep in step with the frame. The decision was to fill the caret with the
frame's brass instead — one `::before`, `clip-path: path('M0,10 L8.6,1.4 Q10,0.2 11.4,1.4 L20,10 Z')`,
20 × 10 px, base at `bottom: calc(100% + 2px)` so it overlaps 1 px *inside* the 3 px frame, `::after`
switched off with `content: none`, plus a vertically reflected path for
`.p-overlaypanel-flipped`. **Do not restore the rim without asking.**

**Hover/selected states are interpolated.** The reference has no hover state, so row hover,
`.p-highlight` and the dropdown's selected row were interpolated from its static pixels — say so in
the memory notes rather than implying they were measured.

**Sub-pixel detail is approximated.** The key frame is a single `border-box` gradient, so it cannot
vary per side the way a real bullnose does; the eye accepts it because the top/bottom picks up the
bright stops. Record approximations like this instead of presenting them as exact.

## Deferred, and why

Kept in `.github/memory/todo.md` rather than silently dropped: the Habitat grid's column pitch
(container-driven, ≠ the reference's card width — a *card width* difference, not a styling one);
`.blong-inspector__body` keeps a `max-height` + scroll the reference does not have (to stop large
JSON dumps pushing the plate arbitrarily tall); the grain tile repeats every 256 CSS px (invisible
in the tested layouts); and typography is **metrics-matched, not face-matched** — the design's
geometric sans is neither bundled nor installed, so `--wood-font` is a preference list and a truly
exact match needs a self-hosted `@font-face`, an architectural decision deliberately not taken.

## Environment note

The container has **no** Poppins/Montserrat/Jost/Roboto — only DejaVu — and Storybook's
`preview.tsx` asks for Roboto, which is also absent. Check `fc-list : family` before assuming a
font change is visible in a screenshot. The *metrics* (sizes, weights, colours) are what carry the
match.
