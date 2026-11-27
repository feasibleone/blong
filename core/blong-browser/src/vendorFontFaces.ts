/**
 * The vendor grid's web faces, dropped from every stylesheet a build carries.
 *
 * `@svar-ui/react-grid/all.css` declares six `@font-face` rules — Roboto 400 and 500, Open Sans
 * 400, 500, 600 and 700 — whose only source besides `local("")` is `https://cdn.svar.dev`. A
 * deployment that serves `font-src 'self' data:` refuses them, and being *declared* is enough for
 * the browser to try them: no element has to name a family. The minimal sheet the vendor also
 * ships (`style.css`) carries no faces but only 15 of the 241 theme variables, so dropping the
 * full sheet is not an option — the theme collapses (`@@D-1033`).
 *
 * Restating the faces as `local()` lookups does not help: a repeated `@font-face` with the same
 * family, style and weight is added beside the vendor's, not substituted for it, so
 * `document.fonts` holds both sets and the CDN source is still attempted (`@@F-864`).
 *
 * What is left is to take the rules out of the stylesheet the build emits, which is what this
 * does. The transform is content-driven rather than aimed at one package: any stylesheet that
 * names a `cdn.svar.dev` face loses it, so a vendor bump that rewords the face or adds a seventh
 * one is covered, and a sheet that only *mentions* the host in prose is untouched.
 */
import {type Plugin} from 'vite';

/** Name of the Vite plugin, exported so a host can reason about what ran. */
export const STRIP_VENDOR_FONT_FACES = 'blong-strip-vendor-font-faces';

/** One `@font-face` rule. The rule never nests a block, so a flat match is exact. */
const FONT_FACE = /@font-face\s*\{[^}]*\}/gi;

/**
 * Drop every `@font-face` rule whose sources name `cdn.svar.dev`.
 *
 * Comments are left alone: a rule is only removed when its body carries the host, and CSS
 * comments are outside the matched braces.
 */
export function stripVendorFontFaces(css: string): string {
    return css.replace(FONT_FACE, face => (face.includes('cdn.svar.dev') ? '' : face));
}

/**
 * The plugin form, for `defineBlongViteConfig`.
 *
 * `enforce: 'pre'` so it sees the stylesheet before Vite's own CSS plugin turns it into a module;
 * a sheet without the host costs one substring test and is handed back untouched.
 */
export function vendorFontFaces(): Plugin {
    return {
        name: STRIP_VENDOR_FONT_FACES,
        enforce: 'pre',
        transform(code, id) {
            if (!id.split('?')[0]!.endsWith('.css')) return null;
            if (!code.includes('cdn.svar.dev')) return null;
            return {code: stripVendorFontFaces(code), map: null};
        },
    };
}
