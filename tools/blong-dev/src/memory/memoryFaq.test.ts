// memory-refs: ignore — the fixtures below carry reference-shaped text on purpose.
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
    FOLD_SIMILARITY,
    SAME_QUESTION_SIMILARITY,
    evidenceOfHits,
    paragraphsOf,
    parseFaqBody,
    questionKey,
    questionSimilarity,
    questionTitle,
    recordQuestion,
    renderFaqBody,
} from './memoryFaq.ts';
import {MAX_TITLE_LENGTH} from './memoryTypes.ts';

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

test('an answer is prose paragraphs, and rewriting it does not grow blank lines', async t => {
    // The answer was written through the body helper, which wraps to lines: every wrapped line then
    // read back as its own paragraph, so a long answer became one fragment per line with a blank
    // line between each (`@@F-839`). The paragraphs are the unit; the wrapping is the writer's.
    const prose =
        'Settled: the transcript colours code with a library rather than a scanner of its own, and ' +
        'the entry holds the reasoning — the grammars it brings, the size comparison, and the two ' +
        'consequences. The hits the question was matched to predate the change. Nothing about a ' +
        'code-colouring dependency is still open to decide.';
    const paragraphs = paragraphsOf(prose);
    t.same(paragraphs, [prose], 'one paragraph stays one paragraph');

    const once = renderFaqBody({
        asked: [{date: '2026-11-25', count: 1, query: 'a question'}],
        answer: paragraphs,
        certainty: 0.85,
        confirmed: true,
        confirmation: paragraphsOf('the implementation, its tests\nand two green runs'),
    });
    const answer = once.slice(once.indexOf('## ') + 1);
    t.notOk(
        once.some((line, index) => line === '' && once[index + 1]?.startsWith('of its')),
        'no wrapped line became a paragraph',
    );
    t.equal(
        parseFaqBody(once).answer.length,
        1,
        'and it reads back as one paragraph with no fragments',
    );

    // Two paragraphs stay two, with one blank line between them, however many times it is written.
    const twice = renderFaqBody({...parseFaqBody(once), answer: ['one', 'two']});
    t.equal(parseFaqBody(twice).answer.length, 2, 'two paragraphs round-trip');
    t.ok(answer.length > 0, 'the answer is there to read');
    t.end();
});

test('a paraphrase the bank ranks high enough is the same question, and a weaker one is not', async t => {
    // The title comparison cannot see "which library colours the fences" in "syntax highlighting
    // dependency", so the bank's own ranking is the second way in — with a floor, because an
    // unrelated question still scores in the same band against every entry on file (`@@D-1012`).
    setHindsightStoreFactory(() => null);
    const repo = tempRepo(['core/x']);
    t.teardown(() => {
        setHindsightStoreFactory(null);
        repo.restore();
    });

    const first = await recordQuestion(repo.dir, {
        query: 'syntax highlighting dependency',
        hits: [hit(['memory', 'kind:friction', 'id:F-001', 'area:core/x'], 0.4)],
        date: '2026-11-12',
    });
    const path = join(repo.dir, 'core/x/.github/memory/faq.md');

    // A rephrasing the bank puts above the floor: folded in, not filed beside it.
    const strong = await recordQuestion(repo.dir, {
        query: 'which library colours the code fences',
        hits: [
            hit(['memory', 'kind:faq', `id:${first.id}`, 'area:core/x'], FOLD_SIMILARITY + 0.05),
            hit(['memory', 'kind:friction', 'id:F-002', 'area:core/x'], 0.5),
        ],
        date: '2026-11-13',
    });
    t.equal(strong.id, first.id, 'the paraphrase lands on the question already on file');
    t.equal(strong.created, false, 'and no second question is written');
    t.equal(strong.asked, 2, 'the asking is counted');
    t.notMatch(readFileSync(path, 'utf8'), /### Q-002/, 'one entry, not two');

    // A question the bank only puts near one: recorded, with the question it resembles named so the
    // reader can fold it by hand.
    const weak = await recordQuestion(repo.dir, {
        query: 'how long does the semantic index keep a document',
        hits: [
            hit(['memory', 'kind:faq', `id:${first.id}`, 'area:core/x'], FOLD_SIMILARITY - 0.1),
        ],
        date: '2026-11-14',
    });
    t.equal(weak.created, true, 'below the floor it is a new question');
    t.same(
        weak.candidates?.map(candidate => candidate.id),
        [first.id],
        'and the question it resembles is carried out with it',
    );
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

test('a title is one line, a question, and within the title budget', async t => {
    t.equal(questionTitle('why is the index stale?'), 'Why is the index stale?', 'cased, one ?');
    const long = questionTitle(
        'why does the generated index block go stale after an entry is moved between two files and ' +
            'then moved back again by a second command that nobody expected to touch it at all',
    );
    t.ok(long.length <= MAX_TITLE_LENGTH, `kept to ${MAX_TITLE_LENGTH} columns (${long.length})`);
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
