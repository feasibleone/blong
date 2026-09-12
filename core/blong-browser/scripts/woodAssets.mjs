#!/usr/bin/env node
/* spell-checker: disable */
/**
 * woodAssets — regenerates the image textures used by the wood theme.
 *
 *   node scripts/woodAssets.mjs   (or: npm run theme:wood-assets)
 *
 * The theme (`src/components/Theme/wood.css`) is design-matched to
 * `plans/theme/wood-card.png`: a rich oiled-walnut card plate with a polished,
 * light-catching bevel, and carved-in charcoal input channels surfaced with a
 * fine woven micro-mesh. CSS alone cannot reproduce organic grain or a woven
 * weave, so this script synthesises them and writes them as committed files
 * (`src/components/Theme/assets/`), referenced from the generated
 * `wood-assets.css` through the `--wood-*` custom properties.
 *
 * Delivery: the two large textures are emitted as files and referenced with a
 * plain relative `url("./assets/…")`. That form needs no per-environment
 * handling — Vite rewrites it in Storybook dev (verified: resolves and 200s),
 * and the suite build's `base: '/s/'` turns it into `/s/assets/<hash>.<ext>`,
 * which is exactly what `static.ts` serves (`prefix: '/s'`, `immutable`,
 * `maxAge: '1y'`). Vite's `assetsInlineLimit` then decides per environment
 * whether a texture stays inline; the package's own lib build inlines
 * everything, so `dist/` consumers are unaffected either way.
 *
 * (An earlier revision inlined everything because Storybook's Vite was believed
 * not to rewrite relative `url()` in project CSS. That is not true of the
 * current toolchain — see `decision.md` §"Investigation — emitting the theme
 * textures as files / WebP".)
 *
 * The small textures — the two 1×8 ramps and the two SVGs — stay as data URIs:
 * a few hundred bytes each, well under any sensible inline limit, and inlining
 * avoids two extra requests for every input on the page.
 *
 * `wood-edge` is encoded as **WebP lossless** (−42% vs PNG: smooth gradients
 * and alpha are what its lossless mode is good at). The 512² grain is
 * deliberately **not**: WebP lossless is ~3% *larger* on that much entropy, and
 * lossy WebP (q80, −38%) lifts the tile's wrap discontinuity from 0.74 to 3.73
 * — above the mean neighbour delta — i.e. it turns the seamless tile into a
 * visibly seamed one. Tiles stay small for the usual reason: every consumer
 * ships their bytes.
 *
 * Everything it emits is either seamlessly tileable (both axes) or a 1-D
 * profile that is uniform along the other axis, so a single tile stretches to
 * any card / input size without distortion:
 *
 *   wood-grain         512×512 grayscale, tiles in X and Y (drawn at 256px so it
 *                      is 1:1 on a DPR-2 display), `overlay`-blended over the
 *                      CSS walnut base (colour lives in the CSS).
 *   wood-edge           96×96 RGBA 9-slice bevel frame (32px slices, 12px arc,
 *                      drawn into a 16 CSS-px border): countersunk dark rim +
 *                      warm top light, transparent centre.
 *   wood-mesh          SVG woven micro-mesh, tiles in X and Y, drawn at 4px.
 *   wood-btn-dots      SVG 4px dot lattice for the brass toolbar buttons.
 *   wood-recess-top      1×8 RGBA top inner-shadow ramp (uniform in X).
 *   wood-recess-bottom   1×8 RGBA bottom glare ramp (uniform in X).
 *
 * All randomness is a deterministic integer hash, so re-running the script is
 * reproducible. ImageMagick (`magick`) is used purely as a raw-pixels → PNG
 * encoder; no runtime dependency on it is introduced.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME_DIR = resolve(HERE, '../src/components/Theme');
const OUT_CSS = resolve(THEME_DIR, 'wood-assets.css');
// Committed and referenced by the generated CSS as `./assets/…`.
const OUT_ASSETS = resolve(THEME_DIR, 'assets');
// Scratch space for the textures that only ever get inlined as data URIs, so the
// package keeps no stray files.
const WORK_DIR = join(tmpdir(), 'blong-wood-assets');

/* ── raw pixels → PNG ───────────────────────────────────────────────────── */

/**
 * Encode a raw pixel buffer as an image file — PNG or WebP, per the extension.
 * @param {number} w width
 * @param {number} h height
 * @param {1|3|4} channels gray / rgb / rgba
 * @param {Uint8Array} data raw samples, row-major
 * @param {string} out output path
 * @param {string[]} extra additional ImageMagick output options
 */
function encode(w, h, channels, data, out, extra = []) {
    const coder = channels === 1 ? 'gray:-' : channels === 3 ? 'rgb:-' : 'rgba:-';
    // `-strip` drops metadata (notably the `tIME` chunk) so the output is
    // byte-identical across runs — otherwise the committed data URIs churn.
    execFileSync(
        'magick',
        ['-size', `${w}x${h}`, '-depth', '8', coder, ...extra, '-strip', out],
        {input: Buffer.from(data.buffer, data.byteOffset, data.byteLength)},
    );
}

/** File → `url("data:image/png;base64,…")`, for the textures kept inline. */
function dataUri(path) {
    return `url("data:image/png;base64,${readFileSync(path).toString('base64')}")`;
}

/** Committed asset → the relative `url("./assets/…")` Vite resolves for us. */
function fileUri(name) {
    return `url("./assets/${name}")`;
}

/* ── deterministic value noise (periodic on the unit square) ─────────────── */

/** Integer hash → [0,1). */
function hash(x, y, seed) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
}

const smooth = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Bilinear value noise on a lattice of `px`×`py` cells that **wraps** — so the
 * unit square is seamless in both axes.
 */
function valueNoise(x, y, px, py, seed) {
    const fx = x * px;
    const fy = y * py;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = smooth(fx - ix);
    const ty = smooth(fy - iy);
    const wx = i => ((i % px) + px) % px;
    const wy = i => ((i % py) + py) % py;
    const v00 = hash(wx(ix), wy(iy), seed);
    const v10 = hash(wx(ix + 1), wy(iy), seed);
    const v01 = hash(wx(ix), wy(iy + 1), seed);
    const v11 = hash(wx(ix + 1), wy(iy + 1), seed);
    return lerp(lerp(v00, v10, tx), lerp(v01, v11, tx), ty);
}

/** Fractional Brownian motion over the periodic lattice. */
function fbm(x, y, px, py, octaves, seed, gain = 0.5) {
    let amp = 1;
    let sum = 0;
    let norm = 0;
    let ox = px;
    let oy = py;
    for (let o = 0; o < octaves; o++) {
        sum += amp * valueNoise(x, y, ox, oy, seed + o * 101);
        norm += amp;
        amp *= gain;
        ox *= 2;
        oy *= 2;
    }
    return sum / norm;
}

/* ── wood grain ─────────────────────────────────────────────────────────── */

const WOOD = {w: 512, h: 512};

const clamp8 = v => Math.max(0, Math.min(255, Math.round(v)));

/**
 * Seamless walnut grain, **authored at 2× device resolution** (512px tile drawn
 * at `background-size: 256px`, so it is 1:1 on a DPR-2 display and only ever
 * downsampled on DPR 1). Output is grayscale and neutral around 128 so the
 * theme's CSS walnut gradient supplies the hue and `overlay` blending turns the
 * luminance swing into warm light / dark grain.
 *
 * The grain is built from three layers: a strong domain warp that sweeps the
 * growth bands into organic curves, variable-width bands separated by thin
 * dark seams (with broad light earlywood between them), and long horizontal
 * fibre streaks. Every input is periodic over the tile, so it tiles in X and Y.
 */
function makeWoodGrain() {
    const {w, h} = WOOD;
    const out = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            const u = i / w;
            const v = j / h;

            // Low-frequency patchiness — breaks up any perceived repetition.
            const patch = fbm(u, v, 2, 2, 3, 3) - 0.5;

            // Gentle domain warp: wood bands drift and undulate rather than
            // following strict horizontal lines, but they stay soft and open.
            // Kept small — the design's grain is close to horizontal.
            const sweep = fbm(u, v, 3, 2, 3, 11) - 0.5;
            const ripple = fbm(u, v, 5, 6, 3, 23) - 0.5;
            const V = v + sweep * 0.05 + ripple * 0.012;

            // Soft, variable-width growth bands (≈12 CSS px apart at 256px draw).
            const phase = V * 20 + sweep * 1.4;
            const f = phase - Math.floor(phase);
            const band = Math.sin(Math.PI * f); // broad light earlywood
            const seam = Math.pow(Math.max(0, Math.cos(Math.PI * f)), 2); // soft latewood line

            // Fine stranded fibre. The design's wood is a *dense stipple* of
            // short fibres (~1–3 device px tall, ~10–50 px long) rather than a
            // few long streaks, so the fibre octaves carry a real X frequency
            // (period ≈ 12–44 over the 512 tile) instead of being infinitely
            // stretched. `streak` stays long and soft for the grain lines.
            const strand = fbm(u, v, 12, 170, 2, 37) - 0.5;
            const fineStrand = fbm(u, v, 24, 340, 2, 97) - 0.5;
            const microFibre = fbm(u, v, 44, 480, 1, 113) - 0.5;
            const pore = fbm(u, v, 70, 150, 2, 71) - 0.5;
            const streak = fbm(u, v, 5, 120, 2, 51) - 0.5;

            // Base is 133 so the grain's mean sits at ~128: `overlay` is then
            // neutral on average and the CSS walnut tone shows through unchanged.
            let l = 133;
            l += patch * 38;
            l += (band - 0.5) * 14;
            l -= seam * 22;
            l += strand * 38;
            l += fineStrand * 38;
            l += microFibre * 24;
            l += streak * 22;
            l += pore * 32;

            out[j * w + i] = clamp8(l);
        }
    }
    return {w, h, channels: 1, data: out};
}

/* ── woven micro-mesh (input channel surface) ───────────────────────────── */

/**
 * Seamless woven micro-mesh for the carved input channels, emitted as **SVG**
 * so it stays vector-crisp at any device-pixel ratio (a raster tile upscaled on
 * a DPR-2 display was the "low-res" artefact). An 8×8-unit checker drawn at
 * `background-size: 4px` yields the design's 2 CSS-px squares (dark ≈ rgb(18,16,17),
 * crest ≈ rgb(45,41,41)); the two crest squares carry slightly different tones
 * so the weave does not read as a flat digital checker.
 */
function makeMeshSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8">
<rect width="8" height="8" fill="#121011"/>
<rect width="4" height="4" fill="#2d2929"/>
<rect x="4" y="4" width="4" height="4" fill="#262223"/>
</svg>`;
}

/**
 * Inner panel of the brass toolbar buttons (`plans/theme/wood-buttons-2.png`,
 * cut from `wood.png`): a micarta-like dot lattice.
 *
 * Emitted as a **translucent** SVG (a darkened field plus light dots) so a
 * single asset can be tinted by the panel colour under it — the normal and
 * error/active states then differ only by that base colour. Dots sit on a
 * **3 CSS-px pitch** (measured ≈6 device px at 2×; an 8-unit tile drawn at
 * `background-size: 6px`), which is what the reference's dense pebble texture
 * shows — an earlier 4px pitch read as too sparse.
 */
function makeButtonDotsSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8">
<rect width="8" height="8" fill="#000000" fill-opacity="0.22"/>
<circle cx="2" cy="2" r="1.5" fill="#ffffff" fill-opacity="0.09"/>
<circle cx="6" cy="6" r="1.5" fill="#ffffff" fill-opacity="0.09"/>
</svg>`;
}

/* ── 9-slice bevel frame (card edge) ────────────────────────────────────── */

// Authored at 2× device resolution: the 32px slices are drawn into a 16 CSS-px
// border (`border-image-width: 16px`), so 1 art px = 0.5 CSS px and the 12-unit
// corner arc lands on the card's `border-radius: 6px`.
const EDGE = {size: 96, slice: 32, radius: 12};

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (e0, e1, x) => {
    const t = clamp01((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
};

/** Signed distance to a rounded rectangle centred in the art. */
function sdRoundRect(px, py, halfW, halfH, r) {
    const qx = Math.abs(px) - (halfW - r);
    const qy = Math.abs(py) - (halfH - r);
    const ax = Math.max(qx, 0);
    const ay = Math.max(qy, 0);
    return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * Polished, light-catching bevel frame. Alpha encodes opacity; RGB carries the
 * tint. The profile was re-derived from the design's *per-pixel* edge scan
 * (`wood-card.png` x=540, y=8..34) rather than estimated:
 *
 *   depth (CSS px)  +0.0   +0.5   +1.0   +1.5   +2.0   +2.5   +3.5   +5.0
 *   design rgb      29,19  40,22  124,95 158,118 138,93 117,71 105,60  94,58
 *
 * i.e. a **crisp 1px rim** (supplied by the card's CSS `border`, not the art),
 * then a **narrow** warm highlight that rises to its peak ~1.5 CSS px in and
 * decays back to the wood by ~5 CSS px. Only top-facing facets are lit; the
 * sides and bottom get a gentle inward shade instead.
 *
 * Keeping the rim out of the art is what stopped the edge reading as "too
 * thick": previously the 1px CSS border and an opaque art rim stacked into a
 * ~2px near-black edge. The outer 12-unit arc is transparent so the card's own
 * `border-radius` supplies the rounding.
 */
function makeEdge() {
    const {size, radius} = EDGE;
    const half = size / 2 - 0.5;
    const out = new Uint8Array(size * size * 4);
    const warm = [214, 168, 136]; // reaches the design's 158,118,93 at peak alpha
    const shade = [40, 24, 14];
    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
            const px = i - half;
            const py = j - half;
            const b = -sdRoundRect(px, py, half, half, radius); // depth inside the plate, art px
            if (b < 0 || b > 13) continue;

            // Outward normal (SDF gradient). The design's light is directly
            // above, so only the Y component lights a facet.
            const e = 0.6;
            const gx = sdRoundRect(px + e, py, half, half, radius) - sdRoundRect(px - e, py, half, half, radius);
            const gy = sdRoundRect(px, py + e, half, half, radius) - sdRoundRect(px, py - e, half, half, radius);
            const gl = Math.hypot(gx, gy) || 1;
            const lit = Math.max(0, -(gy / gl));

            // art px → CSS px is ×0.5. The design's scan (`wood-card.png` x=540) is
            // +34 at 1.0px, +68 at 1.5, +48 at 2.0, +27 at 2.5 and back to the wood
            // by ~3.0 — a *narrow* highlight. An earlier version held near-peak out
            // to ~4.5 CSS px, which is why the edge kept reading as too thick.
            const wLight = smoothstep(1.2, 3.0, b) * (1 - smoothstep(3.0, 6.0, b)) * lit;
            const wShade = (1 - lit) * Math.max(0, 1 - b / 11);
            const wSum = wLight + wShade;
            if (wSum <= 0) continue;

            const micro = (fbm(i / size, j / size, 40, 40, 2, 33) - 0.5) * 8;
            const k = (j * size + i) * 4;
            out[k] = clamp8((warm[0] * wLight + shade[0] * wShade) / wSum + micro);
            out[k + 1] = clamp8((warm[1] * wLight + shade[1] * wShade) / wSum + micro);
            out[k + 2] = clamp8((warm[2] * wLight + shade[2] * wShade) / wSum + micro);
            out[k + 3] = clamp8(Math.min(1, wLight * 0.52 + wShade * 0.34) * 255);
        }
    }
    return {w: size, h: size, channels: 4, data: out};
}

/* ── 1-D recess ramps (input channel) ───────────────────────────────────── */

/**
 * Vertical alpha profile stretched over an input (uniform in X). Authored at 2×
 * and drawn at `background-size: 100% 4px`, so 1 art px = 0.5 CSS px.
 */
function makeRamp(profile) {
    const n = profile.length;
    const out = new Uint8Array(n * 4);
    profile.forEach(([r, g, b, a], idx) => {
        const k = idx * 4;
        out[k] = r;
        out[k + 1] = g;
        out[k + 2] = b;
        out[k + 3] = Math.round(a * 255);
    });
    return {w: 1, h: n, channels: 4, data: out};
}

/**
 * Top of the carved channel: a tight occlusion ~3.5 CSS px deep — near black at
 * the lip, dropping to the mesh tone. (The design has no wide top shadow.)
 */
const RECESS_TOP = makeRamp([
    [3, 2, 2, 0.97],
    [5, 4, 3, 0.95],
    [7, 6, 5, 0.88],
    [9, 7, 6, 0.78],
    [11, 9, 8, 0.62],
    [13, 11, 10, 0.42],
    [14, 12, 11, 0.22],
    [15, 13, 12, 0.06],
]);

/**
 * Bottom lip: the **small glare** the design shows — a soft light band peaking
 * ~2.5 CSS px above the channel floor, fading to nothing *at* the floor so the
 * recess ends on the mesh (no shadow line). The dark rim comes from the CSS
 * border, not from this ramp.
 */
const RECESS_BOTTOM = makeRamp([
    [140, 132, 122, 0.0],
    [140, 132, 122, 0.05],
    [140, 132, 122, 0.14],
    [142, 134, 124, 0.19],
    [140, 132, 122, 0.16],
    [136, 128, 118, 0.1],
    [132, 124, 114, 0.04],
    [130, 122, 112, 0.0],
]);

/* ── run ────────────────────────────────────────────────────────────────── */

function main() {
    mkdirSync(WORK_DIR, {recursive: true});
    mkdirSync(OUT_ASSETS, {recursive: true});
    const files = {
        // Served from `./assets/` (see the header).
        grain: resolve(OUT_ASSETS, 'wood-grain.png'),
        edge: resolve(OUT_ASSETS, 'wood-edge.webp'),
        // Inlined into the CSS, so scratch space is enough.
        recessTop: resolve(WORK_DIR, 'wood-recess-top.png'),
        recessBottom: resolve(WORK_DIR, 'wood-recess-bottom.png'),
    };

    const grain = makeWoodGrain();
    // The blur wraps (virtual-pixel tile) so the softness does not break the
    // seamless tiling, and smooths the fine noise into a hand-rubbed finish.
    // Kept tight at 512 so the 2×-authored grain stays detailed.
    encode(grain.w, grain.h, grain.channels, grain.data, files.grain, [
        '-virtual-pixel',
        'tile',
        '-blur',
        '0x0.15',
        // 32 grey levels keep the inlined payload ~25% smaller; verified
        // indistinguishable from 8-bit at 2× (the composite shows no banding).
        '-depth',
        '5',
        '-define',
        'png:compression-level=9',
    ]);
    const edge = makeEdge();
    // WebP lossless, not PNG: 42% smaller on this content (smooth gradients +
    // alpha), where the grain's pure entropy goes the other way. `-strip` keeps
    // the output byte-identical across runs so the committed file does not churn.
    encode(edge.w, edge.h, edge.channels, edge.data, files.edge, ['-define', 'webp:lossless=true']);
    // The mesh and button dots are SVG (vector-crisp at any DPR) rather than
    // raster tiles.
    const meshSvg = makeMeshSvg();
    const buttonSvg = makeButtonDotsSvg();
    encode(RECESS_TOP.w, RECESS_TOP.h, 4, RECESS_TOP.data, files.recessTop);
    encode(RECESS_BOTTOM.w, RECESS_BOTTOM.h, 4, RECESS_BOTTOM.data, files.recessBottom);

    const css = `/* spell-checker: disable */
/* ==========================================================================
   WOOD THEME — GENERATED TEXTURES (do not edit by hand)
   Regenerate with:  npm run theme:wood-assets

   Image textures synthesised from the \`plans/theme/wood-card.png\` design.
   The two large ones are files under \`./assets/\` and are referenced with a
   relative \`url()\`, which Vite rewrites for both Storybook dev and the
   \`base: '/s/'\` suite build; the tiny ramps and the two SVGs stay inline as
   data URIs. See the generator header for each asset's tileability / stretch
   guarantees and the CSS-side geometry coupling.
   ========================================================================== */
.blong-app-wood,
.blong-theme-wood {
    /* Seamless walnut grain (grayscale, overlay-blended over the CSS base). */
    --wood-grain: ${fileUri('wood-grain.png')};
    /* 9-slice polished bevel frame (32px slices, 12px arc, transparent centre).
       WebP lossless: see the generator header for why this one and not the grain. */
    --wood-edge: ${fileUri('wood-edge.webp')};
    /* Woven micro-mesh for carved input channels (SVG → crisp at any DPR). */
    --wood-mesh: url("data:image/svg+xml;base64,${Buffer.from(meshSvg).toString('base64')}");
    /* Micarta dot lattice for the inner panel of the brass toolbar buttons. */
    --wood-btn-dots: url("data:image/svg+xml;base64,${Buffer.from(buttonSvg).toString('base64')}");
    /* Carved-channel ramps (uniform in X → stretch to any width). */
    --wood-recess-top: ${dataUri(files.recessTop)};
    --wood-recess-bottom: ${dataUri(files.recessBottom)};
}
`;
    writeFileSync(OUT_CSS, css);
    let total = 0;
    for (const [name, path] of Object.entries(files)) {
        const bytes = readFileSync(path).length;
        total += bytes;
        console.log(`${name.padEnd(13)} ${String(bytes).padStart(7)} B`);
    }
    console.log(`${'meshSvg'.padEnd(13)} ${String(meshSvg.length).padStart(7)} B`);
    console.log(`${'buttonSvg'.padEnd(13)} ${String(buttonSvg.length).padStart(7)} B`);
    console.log(`\n${total} B of textures → ${OUT_CSS} (${readFileSync(OUT_CSS).length} B)`);
    console.log(`files served from ${OUT_ASSETS}`);
}

main();
