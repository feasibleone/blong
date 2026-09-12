# PrimeReact v10 cascade mechanics (and why variant rules "don't apply")

PrimeReact v10 changed how its own CSS is delivered, and the interaction with a separately injected
base theme is the single largest source of confusing bugs in this area. Read this before debugging
"my rule is ignored" or restyling any caret/border/focus.

## The layering

| Sheet | Where it lives | Effect |
| --- | --- | --- |
| `primereact/resources/primereact.min.css` | imported by `Theme.tsx` | **an empty stub in v10** (deprecated; "included in the build as an empty file") — do not grep it for structure |
| Per-component structural CSS | injected by each component inside **`@layer primereact`** | untargetable by ordinary cascade reasoning; a layer |
| `theme.css` for the selected family | injected by `Theme.tsx` as text into `<style id="blong-prime-theme">` | **unlayered** |
| `<variant>.css` | imported by `Theme.tsx` | unlayered, and scoped by a descendant selector |

Unlayered rules beat layered ones regardless of source order, which is why a variant selector like
`.blong-app-wood .p-inputtext` wins without `!important`. **But the layer is not the whole story:**

> The theme's `.p-overlaypanel:before { border: solid transparent; … }` has **no `border-width`**, so
> it resets the structural sheet's `border-width: 10px` back to `medium` — collapsing the caret to a
> ~2 px nub. The theme rule wins the layer comparison *and* destroys the geometry in the same
> declaration.

So: **any geometry the variant must own has to be restated unlayered, with `!important`**, even
though the variant would otherwise win on specificity. State all of it — `content`, `position`,
size, `border-style`, `border-color`, `border-width` — and the flipped mirror
(`.p-overlaypanel-flipped::before`).

`.p-confirm-popup` has the *same* caret machinery (`.p-confirm-popup:before/after` with
`border-width: 10px/8px` in `@layer primereact`, collapsed by the same unlayered shorthand), so it
needs the same restatement. Tooltip and others may too — check before assuming a component is fine.

### Finding the truth: CDP, not `document.styleSheets`

Scanning every sheet for a selector returns nothing useful, because the structural rules are inside
`@layer primereact` and the JS-injected sheets are not reliably enumerable.

```
DOM.getDocument → DOM.querySelector → CSS.getMatchedStylesForNode
  → pseudoElements[].matches[].rule          (which rule actually wins, and why)
CSS.getStyleSheetText({styleSheetId})        (dump the whole injected sheet)
```

Reach for CDP **first** when a style "isn't applying". It is what finally revealed
`@layer primereact { .p-overlaypanel:before { border-width: 10px } }` versus the theme's unlayered
shorthand.

### Portal overlays

Dropdown panels, hint panels and confirm popups mount on `document.body` — **outside** the
`.blong-app-<variant>` wrapper — so they see only the `blong-theme-<variant>` marker that
`Theme.tsx` puts on `document.documentElement`. Two consequences:

1. Scope their rules on `.blong-theme-<variant>`, not on the wrapper.
2. They **cannot inherit** the wrapper's rules. Any input *inside* a portal (e.g. the dropdown
   panel's own filter field) must be re-declared by hand under the portal scope, even though the
   identical rule already exists for the in-tree case.

Also expose the variant's design tokens (font family, anything with a `--<variant>-*` name) on the
root marker as well as on the wrapper.

## Focus mechanics

- `--focus-ring` **is a decoy** with the vendored `vela-blue` theme: it hard-codes `#93cbf9` in
  every focus rule, so setting the token changes nothing. Declare it anyway for forward
  compatibility, but do not rely on it.
- A variant rule that sets `box-shadow: … !important` (very common for carved/socket controls)
  **silently overrides the base focus ring** — those controls then have *no* visible focus. This
  happened to both the toolbar keys and the checkbox sockets.
- **The fix is `outline`, not a louder shadow:**

  ```css
  .blong-app-wood :is(…) .p-button:focus-visible,
  .blong-app-wood .p-checkbox:not(.p-disabled):has(.p-checkbox-input:focus-visible) .p-checkbox-box {
      outline: 1px solid rgba(201, 168, 120, 0.85) !important;
      outline-offset: 1px !important;
  }
  ```

  Nothing else in the variant touches `outline`, so it cannot collide with the `!important` shadow
  war, and `:focus-visible` keeps it off mouse clicks. Use `:has()` on the hidden input for
  PrimeReact checkbox wrappers.
- `transition: border-color 0.2s` on `.p-dropdown` / `.p-inputtext` means a computed-style read
  immediately after focusing returns the pre-transition colour. Wait ~400 ms.

## Making a "focus glow" match a design

A design may well show focus as a **3 px brass bezel**, not a glow. Implement it with per-side
`border-*-color` plus four directional `inset` shadows rather than a thicker `border` — a thicker
border changes the element's box and jitters the whole form on focus. Add a dark outer line
(`0 0 0 1px rgba(38,12,0,0.9)`) and a dark inner lip
(`inset 0 0 0 3px rgba(14,8,3,0.4)`) if the reference has them.
