/**
 * The layer activation block of `docs/blong/docs/concepts/layer.md`.
 *
 * `WELL_KNOWN_LAYERS` is the single source of truth for "which folders are layers, and which
 * intent activates them" — the loader reads it, `kukum.activation.find` publishes it, and this
 * function renders it. The page's hand-written table was already wrong when this generator was
 * added (it omitted `cli` from every layer that has it), which is the drift the generated block
 * exists to end: the diagram, the table and the runtime are now one expression.
 *
 * Rendered as markdown rather than as a diagram alone, because the two halves answer different
 * questions. The diagram is read per intent ("what does `cli` load?"), which is how a realm author
 * chooses a folder; the table is read per folder ("can `gateway` exist in the browser?"), which is
 * how one checks a name before creating it.
 *
 * Mermaid node labels carry no backticks and no escaped quotes: the parser accepts neither, and a
 * diagram that fails to parse renders as an error box in the reader's browser rather than at build
 * time (see the `[CRITICAL_OBSERVABILITY]` note in the repository instructions).
 */

import {WELL_KNOWN_LAYERS} from './layers.ts';

/** What one platform may declare for a layer: intent names, each mapped to the activation value. */
type PlatformActivation = Record<string, unknown> | undefined;

/** A layer's activation, as `WELL_KNOWN_LAYERS` declares it. */
type LayerActivation = {server?: object; browser?: object};

/** Where no platform activates a layer, in a table cell. */
const ABSENT = '—';

/** The repository's prettier `printWidth` (`.prettierrc.json` / the rush auto-installer config). */
const PRINT_WIDTH = 100;

/**
 * Greedy word wrap at {@link PRINT_WIDTH}.
 *
 * The block is committed, and a formatter run must not change it: prettier re-flows a paragraph to
 * `printWidth`, so a line break chosen by hand makes the artefact stale the first time anybody runs
 * prettier over the page. Wrapping the way prettier wraps keeps the generator's bytes and the
 * formatted file identical, which is what `docs check` then verifies.
 */
function wrap(text: string): string {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(' ')) {
        const candidate = line ? `${line} ${word}` : word;
        if (candidate.length > PRINT_WIDTH && line) {
            lines.push(line);
            line = word;
        } else {
            line = candidate;
        }
    }
    return [...lines, line].join('\n');
}

/**
 * Mermaid id for a node in the activation diagram.
 *
 * Hyphen-separated words rather than a concatenation, because a mermaid id cannot carry spaces and
 * a run-together id is a word no spell checker knows — the repository lints its documentation with
 * cspell, and an id that reads as a typo fails the build.
 */
function nodeId(platform: string, intent: string, part: 'intent' | 'layers'): string {
    return `${platform}-${intent}-${part}`;
}

/** The intent names a platform declares for a layer, or an empty list when it declares none. */
function intentsOf(activation: PlatformActivation): string[] {
    return activation ? Object.keys(activation) : [];
}

/**
 * Layer folders grouped by the intent that activates them, for one platform.
 *
 * Declaration order is preserved on both axes, so the diagram reads the way the table reads and a
 * regenerated block is byte-identical.
 */
function byIntent(
    layers: Record<string, LayerActivation>,
    platform: 'server' | 'browser',
): Array<[string, string[]]> {
    const groups = new Map<string, string[]>();
    for (const [folder, activation] of Object.entries(layers)) {
        for (const intent of intentsOf(activation[platform] as PlatformActivation)) {
            const folders = groups.get(intent) ?? [];
            folders.push(folder);
            groups.set(intent, folders);
        }
    }
    return Array.from(groups.entries());
}

/** One platform's subgraph: an edge from each intent to the folders it turns on. */
function platformGraph(
    layers: Record<string, LayerActivation>,
    platform: 'server' | 'browser',
): string {
    const lines = [
        `    subgraph ${platform.toUpperCase()}["${platform} platform"]`,
        '        direction TB',
    ];
    for (const [intent, folders] of byIntent(layers, platform)) {
        lines.push(
            `        ${nodeId(platform, intent, 'intent')}["${intent}"]` +
                ` --- ${nodeId(platform, intent, 'layers')}["${folders.join(' · ')}"]`,
        );
    }
    lines.push('    end');
    return lines.join('\n');
}

/** The activation table, as the page used to carry it by hand. */
function activationTable(layers: Record<string, LayerActivation>): string {
    const rows = Object.entries(layers).map(([folder, activation]) => [
        `\`${folder}\``,
        intentsOf(activation.server as PlatformActivation).join(', ') || ABSENT,
        intentsOf(activation.browser as PlatformActivation).join(', ') || ABSENT,
    ]);
    const header = ['Folder', 'Server active in', 'Browser active in'];
    const widths = header.map((title, column) =>
        Math.max(title.length, ...rows.map(row => row[column].length)),
    );
    const row = (cells: string[]): string =>
        `| ${cells.map((cell, column) => cell.padEnd(widths[column])).join(' | ')} |`;
    return [
        row(header),
        `| ${widths.map(width => '-'.repeat(width)).join(' | ')} |`,
        ...rows.map(row),
    ].join('\n');
}

/**
 * Render the whole block for the marker region in `concepts/layer.md`.
 *
 * The body carries no leading or trailing blank line: the writer puts exactly one blank line after
 * the BEGIN marker and one before the END marker, which is where prettier puts them too. A blank
 * line there is not decoration — without it the comment and the paragraph are read as one HTML
 * block, and the page renders the text as raw HTML.
 *
 * @param layers The activation table to render. Defaults to `WELL_KNOWN_LAYERS`; the parameter is
 *               what lets the test render a fixture and pin the output shape.
 */
export function layersActivation(
    layers: Record<string, LayerActivation> = WELL_KNOWN_LAYERS,
): string {
    return [
        wrap(
            '**Which intent turns a layer on.** Rendered from `WELL_KNOWN_LAYERS` in ' +
                '`core/blong-lib/layers.ts` — the table the loader itself reads, so this block cannot ' +
                'tell a different story from the runtime. Read the diagram per intent, and the ' +
                'table per folder.',
        ),
        '',
        '```mermaid',
        'flowchart LR',
        platformGraph(layers, 'server'),
        platformGraph(layers, 'browser'),
        '```',
        '',
        wrap(
            'A layer missing for a platform is simply not auto-discovered there. `default` means the ' +
                'layer loads regardless of intents; every other name is an intent that must be ' +
                'active, and `cli` is the intent that makes a realm\u2019s handlers exist without ' +
                'serving them.',
        ),
        '',
        activationTable(layers),
    ].join('\n');
}
