/**
 * Build script to bundle the React client into the public/ directory.
 */

import {build} from 'esbuild';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

console.log('[blong-log] Client built successfully');
