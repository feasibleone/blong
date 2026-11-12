/**
 * Unit tests for the FAQ module (`memoryFaq.ts`).
 *
 * The body format is the contract between two authors — the search that records a
 * question and the person who answers it — so the cases that matter are the round trip
 * through the labelled fields, the word matching that keeps one question one entry, and
 * the evidence a result set leaves behind.
 */

import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {test} from 'tap';

import {setHindsightStoreFactory} from './hindsight/hindsightRuntime.ts';
import type {IHindsightHit} from './hindsight/hindsightStore.ts';
import {
    DUPLICATE_SIMILARITY,
    SAME_QUESTION_SIMILARITY,
    evidenceOfHits,
    parseFaqBody,
    questionKey,
    questionSimilarity,
    questionTitle,
    recordQuestion,
    renderFaqBody,
} from './memoryFaq.ts';

/** A search hit, as the bank reports one. */
function hit(tags: string[], similarity: number | null = null): IHindsightHit {
    return {text: '…', score: null, similarity, documentId: null, tags, context: null, type: null};
}

/** A throwaway repository: `rush.json` is what makes the temp directory the root. */
function tempRepo(projects: string[] = []): {dir: string; restore: () => void} {
    const dir = mkdtempSync(join(tmpdir(), 'blong-dev-faq-'));
    writeFileSync(
        join(dir, 'rush.json'),
        JSON.stringify({
            projects: projects.map(folder => ({packageName: folder, projectFolder: folder})),
        }),
    );
    return {dir, restore: () => rmSync(dir, {recursive: true, force: true})};
}

test('a body round-trips through its labelled fields', async t => {
    const body = renderFaqBody({
        asked: [{date: '2026-11-12', count: 2, query: 'why is the index stale'}],
        answer: ['The index is derived from the parsed lines.', 'A move rewrites them.'],
        evidence: [
            {target: 'F-316', score: 0.742},
            {target: 'doc:patterns/memory', score: 0.611},
        ],
        certainty: 0.7,
        rationale: ['two entries agree', 'the fix is untested'],
        confirmed: false,
        confirmation: ['nothing has checked it yet', 'a run of the index would settle it'],
    });

    const parts = parseFaqBody(body);
    t.same(
        parts.asked,
        [{date: '2026-11-12', count: 2, query: 'why is the index stale'}],
        'the asked line keeps its date, count and text',
    );
    t.same(
        parts.answer,
        ['The index is derived from the parsed lines.', 'A move rewrites them.'],
        'each answer paragraph is one block',
    );
    t.same(
        parts.evidence,
        [
            {target: 'F-316', score: 0.742},
            {target: 'doc:patterns/memory', score: 0.611},
        ],
        'the evidence keeps its targets and scores',
    );
    t.equal(parts.certainty, 0.7, 'the score is a number again');
    t.same(parts.rationale, ['two entries agree', 'the fix is untested'], 'and its reasoning');
    t.equal(parts.confirmed, false, 'the answer says it is not confirmed');
    t.same(
        parts.confirmation,
        ['nothing has checked it yet', 'a run of the index would settle it'],
        'with what would settle it',
    );

    const checked = parseFaqBody(
        renderFaqBody({answer: ['See @@doc:patterns/memory.'], certainty: 0.9, confirmed: true}),
    );
    t.equal(checked.confirmed, true, 'a confirmed answer reads back as confirmed');
    t.end();
});

test('an unanswered question says what the search found, or that it found nothing', async t => {
    const blank = renderFaqBody({
        asked: [{date: '2026-11-12', count: 1, query: 'anything'}],
        evidence: [],
    });
    t.match(blank.join('\n'), /Evidence: none — the search matched nothing/, 'no hits is said');
    t.notMatch(blank.join('\n'), /Answer:/, 'and an open question has no answer');

    const handWritten = renderFaqBody({asked: [{date: '2026-11-12', count: 1, query: 'asked'}]});
    t.notMatch(
        handWritten.join('\n'),
        /Evidence:/,
        'a question no search recorded claims no evidence rather than none',
    );

    const recorded = renderFaqBody({
        asked: [{date: '2026-11-12', count: 1, query: 'anything'}],
        evidence: [{target: 'F-316', score: null}],
    });
    t.match(recorded.join('\n'), /Evidence: @@F-316\b/, 'a hit is a token');
    t.equal(parseFaqBody(recorded).evidence?.length, 1, 'which parses back');
    t.notMatch(recorded.join('\n'), /Confirmed:/, 'and an open question claims no confirmation');
    t.end();
});

test('a question is matched by its words, not its punctuation', async t => {
    t.equal(
        questionKey('Why does the index go stale?'),
        questionKey('why does  the index go stale'),
        'case, punctuation and spacing do not make a second question',
    );
    t.ok(
        questionSimilarity(
            'why does the memory index go stale after a move',
            'why does the memory index go stale after moving',
        ) >= SAME_QUESTION_SIMILARITY,
        'a paraphrase is the same question',
    );
    t.ok(
        questionSimilarity('why does the index go stale', 'how do handlers resolve config') <
            DUPLICATE_SIMILARITY,
        'an unrelated question is not',
    );
    t.end();
});

test('a title is one line, a question, and at most eighty columns', async t => {
    t.equal(questionTitle('why is the index stale?'), 'Why is the index stale?', 'cased, one ?');
    const long = questionTitle(
        'why does the generated index block go stale after an entry is moved between two files',
    );
    t.ok(long.length <= 80, `kept to 80 columns (${long.length})`);
    t.match(long, /…$/, 'and says it was cut');
    t.end();
});

test('the evidence is the identifiers the bank returned, best score first', async t => {
    const evidence = evidenceOfHits([
        hit(['memory', 'kind:friction', 'id:F-316'], 0.4),
        hit(['memory', 'kind:decision', 'id:D-042'], 0.8),
        hit(['memory', 'kind:friction', 'id:F-316'], 0.6),
        hit(['kind:documentation', 'path:docs/blong/docs/patterns/memory.md'], 0.61),
        hit(['kind:agent-skill', 'path:.github/skills/blong-realm/SKILL.md'], 0.5),
        hit(['memory', 'kind:friction'], 0.9),
    ]);

    t.same(
        evidence,
        [
            {target: 'D-042', score: 0.8},
            {target: 'doc:patterns/memory', score: 0.61},
            {target: 'F-316', score: 0.6},
            {target: 'skill:blong-realm', score: 0.5},
        ],
        'entry ids, pages and skills each become a target once, at their best score',
    );
    t.end();
});

test('recording a search writes the question, and a repeat reuses the entry', async t => {
    setHindsightStoreFactory(() => null);
    const repo = tempRepo(['core/x']);
    t.teardown(() => {
        setHindsightStoreFactory(null);
        repo.restore();
    });

    const hits = [
        hit(['memory', 'kind:friction', 'id:F-316', 'area:core/x'], 0.742),
        hit(['kind:documentation', 'path:docs/blong/docs/patterns/memory.md'], 0.611),
    ];
    const first = await recordQuestion(repo.dir, {
        query: 'why does the index go stale after a move',
        hits,
        date: '2026-11-12',
    });

    t.equal(first.id, 'Q-001', 'the first question takes the first id');
    t.ok(first.created, 'and is reported as new');
    t.equal(first.area, 'core/x', 'filed under the area its best hit points at');

    const path = join(repo.dir, 'core/x/.github/memory/faq.md');
    const written = readFileSync(path, 'utf8');
    t.match(
        written,
        /### Q-001 — Why does the index go stale after a move\?/,
        'the title is the question',
    );
    t.match(written, /· core\/x · open_/, 'a recorded question is open until answered');
    t.match(
        written,
        /Asked: 2026-11-12 — "why does the index go stale after a move"/,
        'the text as it was asked is kept verbatim',
    );
    t.match(
        written,
        /Evidence: @@F-316 \(0\.742\) @@doc:patterns\/memory \(0\.611\)/,
        'and the identifiers the bank returned',
    );

    const second = await recordQuestion(repo.dir, {
        query: 'Why does the index go stale after a move?',
        hits: [hit(['memory', 'kind:decision', 'id:D-042', 'area:core/x'], 0.5)],
        date: '2026-11-13',
    });

    t.equal(second.id, 'Q-001', 'the repeat lands on the same entry');
    t.equal(second.created, false, 'and says it was not new');
    t.equal(second.asked, 2, 'counting the second asking');

    const again = readFileSync(path, 'utf8');
    t.notMatch(again, /### Q-002/, 'no second entry is written');
    t.match(again, /Asked: 2026-11-13 ×2 — /, 'the asked line moves to the latest date');
    t.match(again, /@@D-042/, 'and new evidence is folded in');
    t.match(again, /@@F-316/, 'while the earlier evidence stays');
    t.end();
});
