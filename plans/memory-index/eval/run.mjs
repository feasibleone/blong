// Retrieval benchmark for the memory semantic index (plans/memory-index/eval/).
//
// Run one measurement pass over queries.json against a Hindsight bank:
//
//   node plans/memory-index/eval/run.mjs --label local
//   node plans/memory-index/eval/run.mjs --label nomic --rerank off
//
// It needs the bank to already hold the whole memory tree (`blong-dev memory index
// --semantic`), because every model has to face the same corpus. Results are written to
// plans/memory-index/eval/results-<label>[-rerankoff].json so runs stay comparable.
//
// Ranking is done over documents, not chunks: a result list is deduped by document_id, so an
// entry split into several chunks is one candidate (chunking is identical for every model).
// Plain .mjs on purpose — see the throwaway-scripts note: a typed .mjs is a SyntaxError, and a
// script under /tmp cannot resolve packages; this one uses only node built-ins.

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
/** Read `--name value` (or `--flag` → true) from the command line. */
function arg(name, fallback) {
    const i = args.indexOf(`--${name}`);
    if (i < 0) return fallback;
    const next = args[i + 1];
    return next === undefined || next.startsWith('--') ? true : next;
}

const label = arg('label');
const url = arg('url', 'http://localhost:8888');
const bank = arg('bank', 'blong');
const rerank = arg('rerank', null); // 'on' | 'off' | null (leave the bank as it is)
const limit = Number(arg('limit', 10));

if (!label || label === true) {
    console.error('usage: node plans/memory-index/eval/run.mjs --label <name> [--rerank on|off]');
    process.exit(2);
}
const suffix = rerank ? `-rerank${rerank}` : '';
const outPath = join(here, `results-${label}${suffix}.json`);

/** A recall call, with the wait bounded so one hung query fails the run. */
async function recall(query) {
    const started = Date.now();
    const response = await fetch(`${url}/v1/default/banks/${bank}/memories/recall`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({query, tags: ['memory'], tags_match: 'all_strict', max_tokens: 8000}),
        signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok)
        throw new Error(`recall ${response.status}: ${(await response.text()).slice(0, 200)}`);
    const body = await response.json();
    return {results: body.results ?? [], latency: Date.now() - started};
}

/** Turn a result list into ranked documents, keeping each document's best (first) hit. */
function rankDocuments(results) {
    const seen = new Map();
    for (const result of results) {
        const id = result.document_id ?? '';
        if (!seen.has(id)) seen.set(id, result);
    }
    return [...seen.entries()].map(([documentId, best]) => ({documentId, best}));
}

/** Set the bank's reranking switch, so the same corpus can be measured with and without it. */
async function setReranking(enabled) {
    const response = await fetch(`${url}/v1/default/banks/${bank}`, {
        method: 'PUT',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({enable_reranking: enabled}),
        signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok)
        throw new Error(`bank config ${response.status}: ${(await response.text()).slice(0, 200)}`);
}

const {queries} = JSON.parse(readFileSync(join(here, 'queries.json'), 'utf8'));

if (rerank) await setReranking(rerank === 'on');

const rows = [];
for (const [index, item] of queries.entries()) {
    const {results, latency} = await recall(item.q);
    const documents = rankDocuments(results);
    const rank = documents.findIndex(document => document.documentId === item.expect);
    const hit = rank >= 0 ? documents[rank] : null;
    rows.push({
        query: item.q,
        expect: item.expect,
        group: item.group,
        rank: rank >= 0 ? rank + 1 : null,
        top: documents.slice(0, 3).map(document => document.documentId),
        similarity: hit ? (hit.best.scores?.semantic ?? null) : null,
        latency,
    });
    const where = rank >= 0 ? String(rank + 1).padStart(2) : ' -';
    console.log(
        `[${String(index + 1).padStart(2)}/${queries.length}] ${where}  ${item.expect.padEnd(6)} ${(latency + 'ms').padEnd(7)} ${item.q.slice(0, 62)}`,
    );
    if (rank < 0) {
        console.log(
            `        missed — nearest: ${
                documents
                    .slice(0, 3)
                    .map(d => d.documentId)
                    .join(', ') || '(none)'
            }`,
        );
    }
}

/** Share of queries whose entry is in the first k ranked documents. */
function hitRate(group, k) {
    const scored = group.filter(row => row.rank !== null && row.rank <= k).length;
    return group.length ? scored / group.length : 0;
}

/** Mean reciprocal rank: 1/rank for a hit, 0 for a miss. */
function mrr(group) {
    const total = group.reduce((sum, row) => sum + (row.rank ? 1 / row.rank : 0), 0);
    return group.length ? total / group.length : 0;
}

/** Report the three metrics per group and overall, in the shape the decision needs. */
function summarise(name, group) {
    const latency = group.reduce((sum, row) => sum + row.latency, 0) / (group.length || 1);
    return {
        name,
        count: group.length,
        hit1: hitRate(group, 1),
        hit3: hitRate(group, 3),
        hit5: hitRate(group, 5),
        hit10: hitRate(group, 10),
        mrr: mrr(group),
        meanLatencyMs: Math.round(latency),
    };
}

const summaries = [
    summarise('all', rows),
    summarise(
        'paraphrase',
        rows.filter(row => row.group === 'paraphrase'),
    ),
    summarise(
        'lexical',
        rows.filter(row => row.group === 'lexical'),
    ),
];

console.log('\nmodel  group       n   hit@1   hit@3   hit@5  hit@10     MRR   latency');
for (const s of summaries) {
    const percent = value => `${(value * 100).toFixed(0)}%`.padStart(6);
    console.log(
        `${label.padEnd(6)} ${s.name.padEnd(10)} ${String(s.count).padStart(3)} ${percent(s.hit1)} ${percent(s.hit3)} ${percent(s.hit5)} ${percent(s.hit10)} ${s.mrr.toFixed(3).padStart(7)} ${String(s.meanLatencyMs).padStart(7)}ms`,
    );
}

writeFileSync(
    outPath,
    `${JSON.stringify({label, url, bank, rerank, queries: queries.length, summaries, rows}, null, 4)}\n`,
);
console.log(`\nwritten ${outPath}`);
