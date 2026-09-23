/**
 * Tests for {@link layersActivation} — which double as the generator of the block it renders.
 *
 * The block lives between a marker pair in `docs/blong/docs/concepts/layer.md` and is registered in
 * `docs/blong/docs-artifacts.json` (`layers.activation`), so `blong-dev docs check` fails when it is
 * stale. This test fails too, for the same reason and with a message that says how to fix it: a
 * generated block is meant to be regenerated, never edited.
 *
 * Regenerate with:
 *
 *     BLONG_UPDATE_DOCS=1 ./node_modules/.bin/tap --allow-incomplete-coverage \
 *         --coverage-report=none layersActivation.test.ts
 */
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'tap';

import {WELL_KNOWN_LAYERS} from './layers.ts';
import {layersActivation} from './layersActivation.ts';

/** The page that carries the block, and the marker it is embedded between. */
const PAGE = 'docs/blong/docs/concepts/layer.md';
const MARKER = 'LAYER ACTIVATION';

const begin = `<!-- BEGIN ${MARKER} -->`;
const end = `<!-- END ${MARKER} -->`;

/** The block as the page must carry it, markers included. */
function expectedBlock(): string {
    // One blank line on each side of the body: prettier puts one after the opening comment and one
    // before the closing one, and a generated block that disagrees with the formatter is stale the
    // first time anybody runs prettier over the page.
    return `${begin}\n\n${layersActivation()}\n\n${end}`;
}

/** Walk up from this file until the repository root (the directory holding `rush.json`). */
function repoRoot(): string {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (;;) {
        if (existsSync(join(dir, 'rush.json'))) return dir;
        const parent = dirname(dir);
        if (parent === dir) throw new Error('no rush.json above layersActivation.test.ts');
        dir = parent;
    }
}

/** What the page carries between the markers — both markers included. */
function committedBlock(): string | undefined {
    const page = readFileSync(join(repoRoot(), PAGE), 'utf8');
    const from = page.indexOf(begin);
    const to = page.indexOf(end);
    if (from === -1 || to === -1 || to < from) return undefined;
    return page.slice(from, to + end.length);
}

test('layersActivation', t => {
    t.test('renders every well-known layer, once', t => {
        const block = layersActivation();
        for (const folder of Object.keys(WELL_KNOWN_LAYERS)) {
            t.equal(
                block.split(`\`${folder}\``).length - 1,
                1,
                `${folder} appears in the table exactly once`,
            );
        }
        t.end();
    });

    t.test('carries the intents the table declares', t => {
        const block = layersActivation();
        // `cli` is the case the hand-written table this replaced had lost: the intent that loads a
        // realm's handlers without serving them.
        t.match(block, /\| `adapter` +\| integration, cli +\| — +\|/, 'adapter is cli-active');
        t.match(block, /\| `gateway` +\| integration +\| — +\|/, 'gateway is not');
        t.match(block, /"error · adapter · orchestrator · server\/api"/, 'cli groups them');
        t.end();
    });

    t.test('renders a fixture, so the shape is pinned rather than described', t => {
        const block = layersActivation({
            only: {server: {default: true}},
            cliOnly: {server: {cli: true}},
        });
        t.match(block, /```mermaid\nflowchart LR\n/, 'the diagram is fenced');
        t.match(block, /subgraph SERVER\["server platform"\]/, 'the server platform is drawn');
        t.match(block, /subgraph BROWSER\["browser platform"\]/, 'and the browser platform');
        t.match(block, /\| `only` +\| default +\| — +\|/, 'a layer active on one platform only');
        t.end();
    });

    t.test('the committed page block is what the renderer produces', t => {
        const block = committedBlock();
        t.ok(block, `${PAGE} carries the ${MARKER} marker pair`);
        if (process.env['BLONG_UPDATE_DOCS'] === '1') {
            const path = join(repoRoot(), PAGE);
            const page = readFileSync(path, 'utf8');
            writeFileSync(path, page.replace(block!, expectedBlock()));
            t.pass(`${PAGE} regenerated`);
            t.end();
            return;
        }
        t.equal(
            block,
            expectedBlock(),
            'regenerate with BLONG_UPDATE_DOCS=1 (see the header of this file)',
        );
        t.end();
    });

    t.end();
});
