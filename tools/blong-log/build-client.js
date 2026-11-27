/**
 * Build script to bundle the React client into the public/ directory.
 *
 * The folder is ignored, and it is what the server serves, so everything the page needs has to be
 * written here: the bundle, the stylesheet esbuild emits beside it, the glyph files, and the shell
 * itself. The shell is a tracked file at the package root — a page that existed only in `public/`
 * meant a checkout had none to serve, and the copy in a developer's folder was hand-made.
 */

import {build} from 'esbuild';
import {copyFileSync, mkdirSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The vendor grid's six `cdn.svar.dev` faces, removed from its stylesheet.
 *
 * The portal build drops them through `vendorFontFaces` in
 * `@feasibleone/blong-browser/vite`; this bundle is made with esbuild and carries its own copy of
 * the same rule. The faces are a third party no deployment with `font-src 'self'` can load, and a
 * page loads them merely for being declared (`@@D-1033`). Kept in step with
 * `core/blong-browser/src/vendorFontFaces.ts`.
 */
const stripVendorFontFaces = css =>
    css.replace(/@font-face\s*\{[^}]*\}/gi, face => (face.includes('cdn.svar.dev') ? '' : face));

/** esbuild plugin: hand the vendor's stylesheet back without those rules. */
const vendorFontFaces = {
    name: 'blong-strip-vendor-font-faces',
    setup(build) {
        build.onLoad({filter: /@svar-ui[\\/]react-grid[\\/].*\.css$/}, args => ({
            contents: stripVendorFontFaces(readFileSync(args.path, 'utf8')),
            loader: 'css',
        }));
    },
};

await build({
    entryPoints: [join(__dirname, 'src/client/app.tsx')],
    bundle: true,
    outfile: join(__dirname, 'public/app.js'),
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    jsx: 'automatic',
    minify: process.argv.includes('--minify'),
    sourcemap: true,
    plugins: [vendorFontFaces],
    define: {
        'process.env.NODE_ENV': '"production"',
    },
    external: [],
    loader: {
        '.tsx': 'tsx',
        '.ts': 'ts',
        // The font files PrimeIcons' stylesheet points at, emitted beside `app.css` so the glyphs
        // load from the bundle rather than from a CDN (`@@F-797`). Without these four the bundle
        // fails outright: esbuild has no default loader for a binary asset.
        '.woff': 'file',
        '.woff2': 'file',
        '.ttf': 'file',
        '.eot': 'file',
        // The stylesheet's last fallback spells the file `primeicons.svg?#primeicons`, and esbuild
        // reads the fragment as part of the path, so the fifth loader is needed for the same reason
        // as the other four rather than for the format's own sake.
        '.svg': 'file',
    },
});

// The page itself, beside the bundle it loads: the same folder, so the server answers `/` with it.
mkdirSync(join(__dirname, 'public'), {recursive: true});
copyFileSync(join(__dirname, 'index.html'), join(__dirname, 'public/index.html'));

console.log('[blong-log] Client built successfully');
