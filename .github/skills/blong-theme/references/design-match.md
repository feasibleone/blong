# Design-match: measuring captures and verifying the result

How to turn a reference screenshot into numbers, and how to get trustworthy pixels back out of the
Storybook page to compare against them. Everything here was learned by getting it wrong first.

## Reading the design capture

Raw pixels are the only source of truth. Note that the whole capture is almost certainly **DPI-2**
— establish the scale first (see `SKILL.md` step 2), and remember that every device-pixel number
below doubles when it becomes a CSS value.

### Text: use the ink bounding box, never the advance width

The width method assumes the design's font advances match whatever font ships in the app. They do
not (the container has no Poppins), and it reads roughly **19 % low**.

```bash
# Isolate the run, then ask ImageMagick for the ink box of the light pixels.
magick design.png -crop 420x44+540+108 +repage /tmp/crop.png
magick /tmp/crop.png -colorspace Gray -threshold 55% -format '%@' info:
# → e.g. 173x28+22+9   → ascender/cap height = 28 device px = 14 CSS px
```

Sanity-check the threshold by measuring a second, known-height run in the same capture.

### Frame thickness, grid pitch, and bevel profiles: scan runs

```bash
# One column of pixels as text — each line carries the grey value.
magick design.png -crop 1x200+700+90 +repage -colorspace Gray txt:- | sed -n '2,40p'
```

Look for a **run of consecutive rows/columns** at the same value: that is a frame's thickness. For
a grid (the checkbox matrix, the canvas ruling), scan a row through the item midlines and count the
pitch between ink runs.

For a **soft** edge — a bevel, an inner shadow, a recess ramp — a single peak value is not enough.
Print the delta at several distances across the edge and compare the whole *decay profile*:

```
distance (CSS px)   1.0   1.5   2.0   2.5   3.0
design delta        34    68    48    27     0
```

Two passes of the wood card bevel failed because they narrowed the band while the **peak position
was already correct** — the highlight simply held near peak ~1.5 px too long. Only the profile
revealed it.

### How many layers paint this edge?

Before tuning any edge, list every layer that draws there: the CSS `border`, an `inset` box-shadow,
a `border-image`, and any rim baked into generated art. The wood card was "still too thick" twice
because the generated art painted a rim *and* the CSS painted a 1 px border. Same failure appeared
later on the buttons (`border-box` gradient **plus** `inset` shadows).

### Typography

Sizes are tuned for the compact root (14 px) and derived from measured cap heights. The cap ratio
is ≈ 0.70 em, so a 14.5 px cap ⇒ `1.45rem`. Colours are sampled directly from flat areas of the
capture.

## Verifying in the live page

Measure in-page for numbers:

- `getBoundingClientRect()` for geometry (and for "are these two keys the same size").
- `getComputedStyle()` for colours, sizes, backgrounds.
- `canvas.measureText()` when a text metric matters.

Then magnify for judgement, because the returned screenshot is downscaled. Add a harness class to
the element:

```css
.harness { position: fixed; left: 0; top: 0; transform: scale(6); transform-origin: top left; }
```

then screenshot that element with the built-in screenshot tool. **Only `transform: scale`
magnifies reliably** — an inline `zoom` misbehaves on `.p-multiselect-*` flex panels **and silently
corrupts every later `getBoundingClientRect` reading** until it is cleared.

### Comparing against the design at true scale

A 2× capture displayed at `background-size: <deviceW>px <deviceH>px` with
`background-position: -<deviceX>px -<deviceY>px` shows at the same screen scale as a
`transform: scale(4)` harness on real CSS px — a genuine side-by-side.

To serve the design PNG to the page, **copy it into the package first**: Vite's `/@fs/` endpoint
403s paths outside the project root, so the files in `plans/theme/` are not reachable. Delete the
copy afterwards.

## Getting pixels out of the browser — what actually works

These are hard environment limits, not preferences:

| Approach | Result |
| --- | --- |
| `page.screenshot({path: …})` into the workspace | `ENOENT` — the browser is outside the workspace FS namespace |
| `require` / dynamic `import()` in `run_playwright_code` | unavailable ("a dynamic import callback was not specified") |
| `page.request.post` to a local collector | `Protocol error (Storage.getCookies)` — not a full Playwright context |
| Node "sink" server in the container | unreachable — the integrated browser only reaches VS Code-forwarded ports (6006 works) |
| base64 in the tool result | works, but lands in the conversation — tiny crops only |

**What works:** measure in-page, and use the built-in screenshot tool **on an element** with a
magnifying harness. For pixel *values*, draw a screenshot into a `<canvas>` in `page.evaluate` and
print a classified ASCII map — but only trust it when the capture frame is anchored to something
visible in the map (a 1 px marker outline of known colour), because:

> `page.screenshot({clip})` returned content offset by ~13 px horizontally and ~6 px vertically
> from the rect requested, in this Storybook iframe.

That offset invalidated three pixel-map experiments which "proved" the caret was missing while it
was rendering correctly. **Anchor every capture to a visible marker** rather than trying to
calibrate the offset — it may not even be stable.

## Other traps that cost time

- `document.styleSheets` cannot see PrimeReact v10's CSS. Use CDP — see
  [prime-react-cascade.md](./prime-react-cascade.md).
- `document.fonts.check('16px Poppins')` returns `true` for fonts that are not installed. The
  authoritative list is `[...document.fonts].map(f => f.family)`; in this container only
  **Nunito Sans** and **primeicons** load.
- `navigate_page` mangles query strings in this remote workspace (`?id=x&viewMode=y` becomes
  percent-encoded and Storybook cannot route it). Call `page.goto(url)` instead.
- `.p-dropdown` / `.p-inputtext` carry `transition: border-color 0.2s`, so a `getComputedStyle`
  read taken immediately after adding a focus class returns the **pre-transition** value. Wait
  ~400 ms or you will conclude the CSS is broken.
- A `page.setContent()` harness can be **silently reverted** by Storybook HMR when the preview
  reloads (e.g. right after regenerating a CSS asset) — the screenshot then shows the story, not
  the harness. Regenerate assets *before* building a harness.
- To hold a self-dismissing element open (the `ActionHint` uses a 2000 ms `setTimeout`), patch
  `window.setTimeout` in the page to ignore that delay before clicking. No code change needed.
- Actions needing real focus/clipboard require CDP `Emulation.setFocusEmulationEnabled`;
  `document.activeElement` lies about `:enabled:focus`.
