/**
 * The observed flow shapes, generated from a real run and published in-package.
 *
 * This file is both halves of the artifact: it drives one real execution of each
 * scheme through a live service, renders what the service observed, and compares the
 * result with `docs/observed-flows.md` — the file the docs page embeds verbatim. The
 * comparison is what makes the published diagrams *evidence* rather than a drawing
 * somebody maintained: a leg renamed in the code, a call added, a receiver that stops
 * answering, all make this test fail until the artifact is regenerated, and regenerating
 * it is a run, not an edit.
 *
 * Determinism is why the artifact can be compared byte for byte. Nothing rendered here
 * comes from the clock: a call is placed by the **counter path** its caller assigned, and
 * the table's counts are per execution. Run it twice and the output is identical.
 *
 * Regenerate with:
 *
 *     SEMANTIC_LOG_UPDATE_DIAGRAMS=1 ./node_modules/.bin/tap test/flow/observedFlows.test.ts
 */

import {mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

import t from 'tap';

import {startFlow, type FlowKind} from '../../flow/flows.ts';
import {isLegId} from '../../src/context.ts';
import {createApp} from '../../src/service/app.ts';
import {modelOfUnion, renderSequence} from '../../src/service/diagram.ts';
import type {FlowUnion, ObservedLeg} from '../../src/service/flowLedger.ts';
import {FlowLedger} from '../../src/service/flowLedger.ts';
import {getWriter, setWriter} from '../../src/writer.ts';

/** The artifact, and the page that embeds its blocks. */
const ARTIFACT = fileURLToPath(new URL('../../docs/observed-flows.md', import.meta.url));
const PAGE = fileURLToPath(
    new URL('../../../../docs/blong/docs/patterns/semantic-log-flows.md', import.meta.url),
);

/** The fixture whose call sites are scanned for the ids the diagrams are labelled with. */
const FLOW_DIR = fileURLToPath(new URL('../../flow/', import.meta.url));

/**
 * Leg ids that are declared but not observed by a happy run, each with its reason.
 *
 * Every entry is a claim that *no* execution of the happy path can reach the call — not that
 * one did not happen to. The list is asserted to be exactly the difference, so a new id that
 * nobody exercises fails the check below rather than being quietly added here.
 */
const FAULT_ONLY: Record<string, string> = {
    // Empty today, and that is the claim: every id the fixture declares is reached by a happy
    // run. The list exists so that a call site nobody exercises fails the check below instead
    // of being quietly accepted, and so that the reason travels with the id where the check
    // reads it. Verified in both directions by mutation: a bogus literal fails, and adding it
    // here with a reason passes.
};

/**
 * Every leg id the fixture's call sites declare, mapped to the file and line that declares it.
 *
 * This is what makes the artifact a **cross-reference** rather than a drawing: the arrow
 * labels and this table come from the same ids, and the ids come from the code — a leg that is
 * renamed in one place and not the other fails the parity test rather than drifting quietly.
 *
 * A declaration is a literal on an `id:` or a `leg:` property, which is how both shapes of the
 * fixture's call sites state one (`bindLeg({id: 'hub.quote.fx', to: 'fxp'}, …)` and the proxy's
 * `{path: '/quotes', phase: 'quote', leg: 'proxy.quote.corridor'}` route table). Comment lines
 * are skipped: an example id in a doc comment is not a call site, and this file's own prose
 * about what a declaration looks like must not be read as one. The match is then validated
 * against the library's own grammar (`isLegId`), so a string that merely looks like a property
 * is not counted as a call.
 */
async function declaredLegs(): Promise<Map<string, string>> {
    const sources = new Map<string, string>();
    const files = (await readdir(FLOW_DIR)).filter(name => name.endsWith('.ts')).sort();
    for (const name of files) {
        const lines = (await readFile(join(FLOW_DIR, name), 'utf8')).split('\n');
        lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('*') || trimmed.startsWith('//')) {
                return;
            }
            for (const match of line.matchAll(
                /(?:\bid|\bleg):\s*'([A-Za-z0-9][A-Za-z0-9._-]*)'/g,
            )) {
                const found = match[1];
                if (isLegId(found) && !sources.has(found)) {
                    sources.set(found, `${name}:${index + 1}`);
                }
            }
        });
    }
    return sources;
}

/** The kinds the fixture runs, in the order the artifact presents them. */
const KINDS: FlowKind[] = ['single', 'inter'];

/** The prose every regeneration keeps, so a rewritten artifact still explains itself. */
const HEADER = `<!--
    GENERATED — do not edit by hand.

    Rendered from a real run of the flows in \`flow/\` by \`test/flow/observedFlows.test.ts\`,
    which fails when this file is stale. Regenerate with:

        SEMANTIC_LOG_UPDATE_DIAGRAMS=1 ./node_modules/.bin/tap test/flow/observedFlows.test.ts

    Each block below is embedded **verbatim** in its section of
    \`docs/blong/docs/patterns/semantic-log-flows.md\`, and the same test compares the two —
    so a diagram cannot say one thing here and another there.
-->

# Observed flows

Each diagram below is drawn from what the **service observed** of one real execution: the
arrow is a call a record declared, the receiver is the participant the caller named, and
the label is the leg id the source code declares — so \`hub.transfer.deliver\` here is
greppable in the code that makes the call, and the table names the file and line that
declares it. Nothing is drawn from a document, which is what lets these replace hand-written
diagrams without becoming another one.

The counts are per execution, so a call a chatty participant logged five records about is
still one call. \`x2\` on an arrow would be two executions' worth of it, and a crossed arrow
is a call the caller declared that nothing answered — a deployment fact that a diagram
drawn from deductions could not show at all.
`;

/**
 * What the service observed of every kind under test.
 *
 * The two schemes run against **one** in-process service, which is what the union is for:
 * the same kind observed across executions, here one execution of each scheme. The sink is
 * the flow's own service destination, so the records travel the real route — a participant
 * posts its batch and the ingest accepts it — rather than a shortcut through the ledger.
 */
async function observed(): Promise<Map<string, FlowUnion>> {
    const cacheDir = await mkdtemp(join(tmpdir(), 'semantic-log-diagrams-'));
    const ledger = new FlowLedger();
    const service = createApp({flowLedger: ledger, embedding: {kind: 'offline', dimension: 16}});
    const restore = getWriter();
    // A run's own output must not land in the middle of tap's, and `setWriter(null)` is
    // the wrong way to say so: it is the process-wide *silence sentinel*, which silences
    // a participant's service sink too — and the sink is exactly what this artifact is
    // generated from. A discarding primary writer silences stdout and nothing else.
    setWriter({write: () => undefined});
    try {
        const address = await service.listen({port: 0, host: '127.0.0.1'});
        for (const kind of KINDS) {
            const flow = await startFlow(kind, {
                cacheDir: join(cacheDir, kind),
                serviceUrl: address,
            });
            try {
                const result = await flow.run();
                if (result.status !== 200) {
                    throw new Error(`the ${kind} fixture did not settle: ${result.status}`);
                }
            } finally {
                await flow.close();
            }
        }
    } finally {
        setWriter(restore);
        await service.close();
        await rm(cacheDir, {recursive: true, force: true});
    }
    const unions = new Map<string, FlowUnion>();
    for (const kind of ledger.kinds()) {
        const union = ledger.unionOf(kind);
        if (union !== undefined) {
            unions.set(kind, union);
        }
    }
    return unions;
}

/** One call as the artifact's table states it. */
function row(
    leg: ObservedLeg,
    end: ObservedLeg['ends'][number] | undefined,
    source: string | undefined,
): string {
    const from = end === undefined ? '—' : `\`${end.caller}\``;
    const to = end === undefined ? '—' : `\`${end.callee}\``;
    // The source column is the cross-reference the whole leg-identity change exists for: an id
    // on the diagram is greppable, and this is where it lands.
    const where = source === undefined ? '—' : `\`flow/${source}\``;
    return `| \`${leg.leg}\` | ${from} → ${to} | ${leg.step ?? '—'} | ${leg.seq ?? '—'} | ${end?.count ?? 0} | ${end?.observed ?? 0} | ${where} |`;
}

/**
 * The marker a block is embedded between, in this file and in the docs page.
 *
 * A pair per kind, because the page documents one scheme per section and the block for a
 * scheme belongs in the section that explains it: the alternative — one block holding both —
 * would have to sit somewhere neither scheme's prose is.
 */
function marker(kind: string, edge: 'BEGIN' | 'END'): string {
    return `<!-- ${edge} OBSERVED FLOWS: ${kind} -->`;
}

/** One scheme's diagram and table, between the markers the docs page embeds verbatim. */
function block(
    unions: Map<string, FlowUnion>,
    sources: Map<string, string>,
    kind: FlowKind,
): string {
    const union = unions.get(kind === 'single' ? 'transfer.single' : 'transfer.inter');
    if (union === undefined) {
        return `${marker(kind, 'BEGIN')}\n_not observed: the fixture produced no records for this kind_\n${marker(kind, 'END')}`;
    }
    const rows = union.legs.flatMap(leg =>
        leg.ends.length === 0
            ? [row(leg, undefined, sources.get(leg.leg))]
            : leg.ends.map(end => row(leg, end, sources.get(leg.leg))),
    );
    return (
        `${marker(union.kind, 'BEGIN')}\n` +
        `Participants: ${union.services.map(service => `\`${service}\``).join(', ')}. ` +
        `${union.legs.length} calls observed across ${union.executions} execution(s).\n\n` +
        '```mermaid\n' +
        renderSequence(modelOfUnion(union)) +
        '```\n\n' +
        '| call | caller → receiver | phase | position | declared | answered | declared in |\n' +
        '| ---- | ----------------- | ----- | -------- | -------- | -------- | ----------- |\n' +
        `${rows.join('\n')}\n` +
        `${marker(union.kind, 'END')}`
    );
}

/** The artifact: the provenance, the prose, and one embeddable block per scheme. */
function artifact(unions: Map<string, FlowUnion>, sources: Map<string, string>): string {
    const blocks = KINDS.map(kind => block(unions, sources, kind));
    return `${HEADER}\n${blocks.join('\n')}`;
}

/**
 * Replace the marked region of `page` with `body`, or leave it alone and say why.
 *
 * An update must not *create* the region: where the block belongs in a page is an editorial
 * decision — under which heading, after which paragraph — and a tool that guessed it would be
 * pushing prose around. It only replaces what a person marked, and reports a page that has no
 * marker so the missing region is fixed by hand rather than by a region appearing somewhere
 * arbitrary.
 */
function syncBlock(page: string, kind: string, body: string): string {
    const begin = marker(kind, 'BEGIN');
    const end = marker(kind, 'END');
    const from = page.indexOf(begin);
    const to = page.indexOf(end);
    if (from === -1 || to === -1) {
        process.stderr.write(
            `observedFlows: ${PAGE} has no ${from === -1 ? 'begin' : 'end'} marker for ${kind}; ` +
                'add the marker pair where the block belongs\n',
        );
        return page;
    }
    return `${page.slice(0, from)}${body}${page.slice(to + end.length)}`;
}

await t.test('the published flow shapes are what a run observes (PRD R23)', async t => {
    const unions = await observed();
    const sources = await declaredLegs();
    const rendered = artifact(unions, sources);
    const update = process.env.SEMANTIC_LOG_UPDATE_DIAGRAMS === '1';
    if (update) {
        await writeFile(ARTIFACT, rendered);
        // The page's embedding of each block is regenerated too, so the two cannot be updated
        // by different hands — and the prose around them is never touched.
        let page = await readFile(PAGE, 'utf8');
        for (const kind of KINDS) {
            page = syncBlock(
                page,
                kind === 'single' ? 'transfer.single' : 'transfer.inter',
                block(unions, sources, kind),
            );
        }
        await writeFile(PAGE, page);
    }
    const published = await readFile(ARTIFACT, 'utf8');
    t.equal(
        published,
        rendered,
        'the artifact is what a run produced, not what a document said it should be — regenerate with SEMANTIC_LOG_UPDATE_DIAGRAMS=1',
    );
    // The diagram is also asserted *as a diagram*: byte equality would pass on a file
    // that is valid but empty, and an artifact nobody can render is not evidence.
    for (const kind of ['transfer.single', 'transfer.inter']) {
        t.match(
            rendered,
            new RegExp(marker(kind, 'BEGIN')),
            `${kind} is published between its markers`,
        );
    }
    t.equal(
        rendered.split('```mermaid').length - 1,
        2,
        'two diagrams, each of them a mermaid block',
    );
    t.notMatch(rendered, /;/, 'and no label carries a statement separator into either of them');
    t.end();
});

await t.test('the docs page embeds each block verbatim (D14)', async t => {
    // The page is where a reader meets these diagrams, so "the docs show what a run observed"
    // is a claim about the page and not about this package's copy of it. Blocks are compared
    // rather than files: the page keeps its own prose around them, and that prose is the part
    // a person edits.
    const unions = await observed();
    const sources = await declaredLegs();
    const page = await readFile(PAGE, 'utf8');
    for (const kind of KINDS) {
        const kindName = kind === 'single' ? 'transfer.single' : 'transfer.inter';
        t.ok(unions.get(kindName) !== undefined, `${kind} was observed`);
        const expected = block(unions, sources, kind);
        t.equal(
            page.split(marker(kindName, 'BEGIN')).length - 1,
            1,
            `${kind}: the page has exactly one block, so the comparison cannot pass on a duplicate`,
        );
        t.ok(
            page.includes(expected),
            `${kind}: the page carries the block a run produced, verbatim`,
        );
        t.ok(
            page.split(marker(kindName, 'END')).length - 1 === 1,
            `${kind}: and its end marker exactly once`,
        );
    }
    t.end();
});

// --- the three honesty checks (D10) ------------------------------------------
//
// An identifier is only worth having if a reader can trust it. Three claims make that true,
// and each is checked here against a real run rather than against the fixture's intent:
//
//   (i)   one execution declares each call to exactly **one** receiver, so an id names one call
//         and not two;
//   (ii)  every id the run observed exists as a **literal in the code**, so a reader can grep it;
//   (iii) every literal in the code is **observed by some run**, or is exempt with a stated
//         reason — otherwise the artifact would quietly stop describing part of the fixture.
//
// Each check was **observed failing** before it was trusted, by making the mistake it exists to
// catch and watching it name the culprit — a check that has never failed is a check nobody has
// tested:
//
//   (i)   `hub.quote.payee`'s call site was given `hub.quote.fx`'s id, so one execution declared
//         one id to two receivers: `transfer.inter/hub.quote.fx was declared to 2 receivers
//         (fxp, payee)`;
//   (ii)  `hub.quote.fx` was declared as `` `hub.quote.${'fx'}` ``, which is a string the code
//         builds rather than a literal it contains: `hub.quote.fx is declared in no file`;
//   (iii) a route no run reaches was added to the proxy's table: the unexercised id was named,
//         and adding it to `FAULT_ONLY` with a reason made the check pass again — which is the
//         property that matters, because the list is asserted to be *exactly* the difference.

t.test('each call an execution made names exactly one receiver (D10 i)', async t => {
    const unions = await observed();
    const executions = [...unions.values()];
    t.ok(executions.length > 0, 'there are executions to check');
    for (const union of executions) {
        for (const leg of union.legs) {
            t.ok(
                leg.ends.length <= 1,
                `${union.kind}/${leg.leg} was declared to ${leg.ends.length} receivers (${leg.ends.map(end => end.callee).join(', ')})`,
            );
        }
        t.equal(
            new Set(union.legs.map(leg => leg.leg)).size,
            union.legs.length,
            `${union.kind}: one entry per call, so an id is one call rather than a repeat of itself`,
        );
    }
    t.end();
});

t.test('every id a run observed is a literal in the code (D10 ii)', async t => {
    // The cross-reference the ids exist for: a label on the diagram that no source declares is
    // a label a reader cannot act on, and the artifact is generated, so it would be published
    // as authoritative.
    const unions = await observed();
    const sources = await declaredLegs();
    const observedIds = new Set(
        [...unions.values()].flatMap(union => union.legs.map(leg => leg.leg)),
    );
    t.ok(observedIds.size > 0, 'there are observed ids to check');
    for (const id of observedIds) {
        t.ok(sources.has(id), `${id} is declared in ${sources.get(id) ?? 'no file'}`);
    }
    t.end();
});

t.test('every id the code declares is observed, or exempt with a reason (D10 iii)', async t => {
    // The other direction, and the one that catches a fixture evolving while the artifact does
    // not: a call site nobody exercises is a leg with no evidence behind it. The exemption list
    // is exact — an id that starts being observed, or stops being declared, fails this test
    // rather than leaving a stale reason in it.
    const unions = await observed();
    const sources = await declaredLegs();
    const observedIds = new Set(
        [...unions.values()].flatMap(union => union.legs.map(leg => leg.leg)),
    );
    const unobserved = [...sources.keys()].filter(id => !observedIds.has(id));
    t.same(
        unobserved,
        Object.keys(FAULT_ONLY),
        'the difference is exactly the exempted ids: no call site is unexercised without a stated reason',
    );
    for (const [id, reason] of Object.entries(FAULT_ONLY)) {
        t.ok(reason.length > 0, `${id} states why no happy run reaches it`);
    }
    t.end();
});
