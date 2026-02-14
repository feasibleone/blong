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
    },
});

console.log('[blong-log] Client built successfully');
