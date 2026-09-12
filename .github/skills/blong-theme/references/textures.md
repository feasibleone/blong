# Textures: generating, calibrating, and shipping theme assets

Only synthesise what CSS genuinely cannot express. Organic wood grain, a woven micro-mesh and an
alpha bevel that must catch light from one direction qualify; gradients, screens, vignettes and
rulings do not — and CSS versions scale to any size for free.

## The three laws

1. **Every texture must tile seamlessly in both axes, or be a 1-D profile uniform along the other
   axis.** The wood set splits cleanly: `grain`/`mesh`/`btn-dots` tile in X and Y; `recess-top` and
   `recess-bottom` are 1×8 ramps uniform in X, so the three-layer recess stack has a *constant*
   thickness at any input height; `edge` is a 9-slice RGBA bevel drawn with `border-image`.
2. **Author at 2× and draw at half size.** The design capture is DPI-2, so 1:1 means the asset is
   authored at 2× device pixels and referenced at half: grain 512 → `background-size: 256px`, edge
   slices 32 → `border-image-width: 16px`, ramps → `100% 4px`, mesh → `4px`, button dots → `6px`.
   This is what makes the variant sharp on a DPR-2 display and merely fine on DPR-1.
3. **Keep tone in CSS.** Pin the tile's mean to 128 (the wood generator uses a base of 133 and
   normalises) so `overlay` blending is neutral, then put all large-scale colour in
   `background-color` + a gradient. Re-toning the variant is then a CSS edit, not a regeneration.
   Re-tuning the *texture* means editing the amplitude block in the generator and re-checking the
   calibration numbers below.

## Calibrating against the design

Eyeballing procedural noise does not converge — the wood grain "looked about right" through five
iterations while being measurably wrong. Match **three statistics** computed over a clean swatch of
the design and over the generated tile:

| Metric | How | Why |
| --- | --- | --- |
| mean tone | `-format '%[fx:mean*255]'` | overall lightness |
| `sdev` | `-format '%[fx:standard_deviation*255]'` | contrast |
| high-frequency energy `hf` | `sdev(image − blur 0x1)` | correlates with "feels low-res" |

```bash
# hf: the standard deviation of the high-pass residual
magick tile.png -colorspace Gray /tmp/a.png
magick /tmp/a.png -blur 0x1 /tmp/b.png
magick /tmp/a.png /tmp/b.png -compose difference -composite \
       -format 'hf=%[fx:standard_deviation*255]\n' info:
```

The wood reference measured tone `rgb 77,48,35`, `sdev` ≈ 9.9, `hf` ≈ 1.35. Tone and `sdev` alone
matched while the texture still read as "flat" — `hf` is what tracked the complaint.

**An over-stretched noise octave is not fine detail.** `fbm(u, v, 2, 320)` over a 512 tile gives
~1.6 px-tall features but a ~256 px wavelength: long continuous streaks, not fibre. Real fine
texture needs a genuine frequency in **both** axes. The wood grain ended up as several modestly
stretched octaves — `fbm(u,v,12,170)`, `(24,340)`, `(44,480)` plus `(5,120)` for the long grain
lines — not one narrow band. Iterations that read as "corduroy" then "topographic contours" were
each a specific miscalibration: too sharp a `seam` exponent (6 → 2), too much domain warp
(0.32 → 0.05), then amplitudes roughly doubled after *measuring* the design's contrast.

## Generator shape

One `scripts/<variant>Assets.mjs`, run via a `theme:<variant>-assets` npm script. It:

- builds textures as **raw pixel buffers** and shells out to ImageMagick purely as a
  raw-pixels → file encoder (no runtime dependency is introduced);
- uses a **deterministic integer hash** for all randomness, so re-running is reproducible;
- passes **`-strip`** — otherwise ImageMagick writes a `tIME` chunk and the committed bytes churn
  on every run (same length, different bytes, invisible until diffed);
- writes the small textures to `$TMPDIR` when they will only ever be inlined, and only the
  committed ones into `src/components/Theme/assets/`;
- emits `src/components/Theme/<variant>-assets.css` exposing everything as `--<variant>-*` custom
  properties, with a header stating each asset's tileability/stretch guarantee and the CSS-side
  geometry coupling.

Assert byte-identity across two consecutive runs (`md5sum` twice) — that is the reproducibility
test.

### Coupling to CSS geometry

Any hard-coded geometry in the art must be mirrored in CSS. The wood bevel bakes a 12-unit corner
arc, which at 2× is a 6 px CSS radius:

```
EDGE.radius (art px) ÷ border-image scale (2) == the element's CSS border-radius
```

Change one and the corners no longer line up. Document it in the generator header.

### One asset, every state

Make a texture **translucent** and tint it from CSS instead of baking colours. A dot lattice built
from `#000` at 0.22 opacity plus `#fff` at 0.09 serves every button state (idle, engaged, error,
disabled) from one file, with the state colour coming from the panel's `background-color`. Use SVG
**presentation attributes** (`fill-opacity`) — `rgba()` in an SVG `fill` is not reliable.

## Format selection — measure, never assume

WebP is not automatically smaller:

| Asset | Result |
| --- | --- |
| `edge` — smooth gradients + alpha, 96² | WebP **lossless** is **−42 %** vs PNG → use it |
| `grain` — 512² pure entropy | WebP lossless is **+3 %** (worse) → keep PNG |
| `grain` lossy q80 | **−38 %**, but it seams the tile (below) |

Lossy compression breaks a tiled texture. Measure the **wrap discontinuity** before accepting it:

```bash
magick tile.png -crop 1x512+0+0   +repage /tmp/left.png
magick tile.png -crop 1x512+511+0 +repage /tmp/right.png
magick compare -metric MAE /tmp/left.png /tmp/right.png null:
```

Accept a format only if that delta stays **at or below the mean neighbour delta inside the tile**
(compare two adjacent interior columns the same way). For the wood grain the wrap delta was 0.74
before and 3.73 after lossy q80, against a mean neighbour delta of 1.89 — i.e. q80 was rejected on
evidence. Always view a **2×2 tiling** as a final check, and note that if the generator's blur ever
stops using `-virtual-pixel tile`, the seams must be re-verified.

Also prefer `-depth` over `-colors` for quantising grayscale: palette PNG conversion cost more than
it saved. The grain is 5-bit, which cut it to ~49 KB gzip with no visible banding.

## Delivery

Emit the **two large** textures as files and reference them with a plain relative `url()`:

```css
--wood-grain: url("./assets/wood-grain.png");
--wood-edge:  url("./assets/wood-edge.webp");
```

Keep the tiny ones (the two 1×8 ramps, the two SVGs — hundreds of bytes each) as inline data URIs:
inlining them avoids extra requests for every input on the page, and they are far below any
sensible inline limit.

This form needs **no per-environment configuration**, verified across all four environments:

| Environment | Result |
| --- | --- |
| Storybook dev | relative URL rewritten, `200 image/png` / `200 image/webp` |
| Suite build (`base: '/s/'`, `assetsInlineLimit: 0`) | `/s/assets/<hash>.<ext>` — exactly what `static.ts` serves (`prefix: '/s'`, `immutable`, `maxAge: 1y`) |
| `storybook build` | grain emitted as a file; the 1.8 KB edge inlined (under its 4 KB default) |
| Package lib build | everything inlined; `dist/` consumers unaffected |

`assetsInlineLimit` deciding differently per environment is Vite doing the right thing — **do not
"align" the configs**. Content hashes were identical across independent builds, so the output is
deterministic.

> An earlier revision inlined everything because Storybook's Vite was believed not to rewrite
> relative `url()` in project CSS. That was **wrong** and the resulting note in repo memory was
> actively misleading. Verify with a probe (serve the CSS, then `fetch()` the URL) before trusting
> any claim about asset rewriting.

Emitted assets live in `src/components/Theme/assets/` and are **committed** — check
`git status --short --untracked-files=all` and `git check-ignore` so a `.gitignore` rule does not
silently swallow them.

## Payload

Every consumer downloads every byte. Report the numbers before and after:

- the generated `<variant>-assets.css` size (the wood de-inlining took it from **65,448 B → 2,616 B**);
- each texture's size;
- the built CSS size raw + gzip.

Keep tiles small for the same reason — a 384² grain would cut ~45 % of the dominant asset but
narrow the repeat to 192 px. Note the repeat distance when choosing a tile size.
