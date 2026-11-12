/**
 * The FAQ: every question asked of the semantic index, the answer it earned, and the
 * evidence behind it.
 *
 * A search is a question, and the answer to it is expensive — it costs a person or an
 * agent reading the hits and deciding what they mean. Without a record, the same
 * question is asked again a week later and answered from scratch. So `memory search`
 * records the question itself: the text as it was asked, the identifiers the bank
 * returned, and where it was filed. The answer is set afterwards, by `memory answer`,
 * and carries a certainty score plus the paragraphs the score rests on.
 *
 * Two rules keep the file useful rather than a transcript. The answer is prose that
 * _points at_ the entries and pages that hold the reasoning instead of repeating them,
 * so a re-read costs one hop and the record cannot drift from its sources. And one
 * question is one entry: a repeat search updates the entry it matches — its `Asked:`
 * count and its evidence — while a question asked in different words is merged into
 * the entry it duplicates rather than living beside it.
 *
 * The body is a small labelled block rather than free prose, so the parser can tell a
 * machine-written recording from an authored answer:
 *
 * ```text
 * Asked: 2026-11-12 ×2 — "why is the generated index out of date"
 *
 * Answer: The index block is derived from the parsed lines, and a move rewrites them.
 * See @@doc:patterns/memory#adding-and-correcting-entries.
 *
 * Evidence: @@F-316 (0.742) @@doc:patterns/memory#what-the-index-holds-and-when (0.611)
 *
 * Certainty: 0.7 — two entries agree; the fix itself is untested
 *
 * Confirmed: no — nothing has checked the conclusion yet
 * ```
 *
 * The last line is what keeps an answer honest. A search result is a lead and an answer is a
 * conclusion someone drew from it, so the entry says whether the follow-up effort — reading the
 * cited entry, grepping the code, running the test — actually confirmed it, and an answer is
 * recorded `no` until something does. A later reader therefore cannot mistake an unverified
 * conclusion for a settled one, and `audit` keeps listing the ones still unconfirmed.
 *
 * Every evidence token is a `@@` reference, so `refs --dangling` already fails when a
 * question points at an entry that was pruned or renumbered — the FAQ is checked by the
 * same machinery as the code that cites it.
 */

import {relative} from 'node:path';

import {UsageError} from '../utils/usageError.ts';
import {tagValue} from './hindsight/hindsightDocument.ts';
import {DOCS_ROOT, SKILLS_ROOT} from './hindsight/hindsightSources.ts';
import type {IHindsightHit} from './hindsight/hindsightStore.ts';
import {addMemoryEntry, migrationProblem} from './memoryAdd.ts';
import {
    entryLines,
    insertEntry,
    refreshIndex,
    removeEntry,
    retireEntry,
    sectionForStatus,
    writeDoc,
} from './memoryEdit.ts';
import {wrapText} from './memoryFormat.ts';
import {forgetEntries, ingestEntries} from './memoryIngest.ts';
import {parseDoc, readDoc} from './memoryParse.ts';
import {isKnownArea, listMemoryFiles} from './memoryPaths.ts';
import {
    ID_PREFIXES,
    MAX_TITLE_LENGTH,
    REFERENCE,
    type IMemoryDoc,
    type IMemoryEntry,
    type MemoryKind,
} from './memoryTypes.ts';

/** The label that opens a field in an FAQ body. */
const LABEL = /^(?<label>Asked|Answer|Evidence|Certainty|Confirmed):\s*/;

/**
 * What an answer says about itself until follow-up work checks it.
 *
 * The default is the point: an answer that arrives with no confirmation is not evidence, and
 * writing that down is what stops the next reader treating it as one.
 */
export const UNCONFIRMED_NOTE = 'not checked yet by analysis or a run';

/** An evidence token: `@@F-316`, `@@doc:patterns/memory`, each with an optional score. */
const EVIDENCE = /@@(?<target>\S+?)(?:\s*\((?<score>\d+(?:\.\d+)?)\))?(?=\s|$)/g;

/** `2026-11-12 ×2 — "the question as it was asked"`. */
const ASKED = /^(?<date>\d{4}-\d{2}-\d{2})(?:\s*×\s*(?<count>\d+))?\s*(?:—\s*(?<query>.*))?$/;

/** A `@@` citation anywhere in a paragraph. */
const CITATION = new RegExp(REFERENCE.source);

/** A memory id, as an evidence target can be. */
const MEMORY_ID = new RegExp(String.raw`^[${ID_PREFIXES}]-\d{3}$`);

/** How similar two questions must be to be the same one, by token overlap. */
export const SAME_QUESTION_SIMILARITY = 0.85;

/** How similar two questions must be before `audit` calls them duplicates. */
export const DUPLICATE_SIMILARITY = 0.6;

/** Evidence targets kept per entry: the best-scoring ones, in score order. */
export const MAX_EVIDENCE = 8;

/** Words that carry no meaning in a question, so they do not decide a match. */
const NOISE_WORDS = new Set([
    'a',
    'am',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'been',
    'being',
    'by',
    'can',
    'could',
    'did',
    'do',
    'does',
    'for',
    'from',
    'has',
    'have',
    'here',
    'i',
    'in',
    'is',
    'it',
    'its',
    'my',
    'of',
    'on',
    'or',
    'our',
    'should',
    'that',
    'the',
    'there',
    'these',
    'this',
    'those',
    'to',
    'was',
    'we',
    'were',
    'with',
    'would',
]);

/** One time a question was asked. */
export interface IFaqAsked {
    /** The most recent date it was asked. */
    date: string;
    /** How many times, including that one. */
    count: number;
    /** The search text, as it was typed. */
    query: string;
}

/** One identifier the search returned. */
export interface IFaqEvidence {
    /** An entry id (`F-316`), a page (`doc:patterns/memory`) or a skill (`skill:blong-realm`). */
    target: string;
    /** The cosine similarity the hit carried, when it had one. */
    score: number | null;
}

/** The parsed body of an FAQ entry. */
export interface IFaqBody {
    asked: IFaqAsked[];
    /** Answer paragraphs; empty while the question is open. */
    answer: string[];
    /**
     * The identifiers a search returned, or `null` when the entry carries no `Evidence:`
     * line at all — a question that was written rather than recorded has nothing to say
     * about what the bank held, and saying "none" would claim a search that never ran.
     */
    evidence: IFaqEvidence[] | null;
    /** 0–1, or `null` while the question is open. */
    certainty: number | null;
    /** What the score covers, as paragraphs. */
    rationale: string[];
    /**
     * True only when follow-up work checked the answer; `false` when it has not, and `null`
     * when the entry carries no `Confirmed:` line at all (or one whose value is neither
     * `yes` nor `no`).
     */
    confirmed: boolean | null;
    /** How the answer was confirmed, or why it has not been. */
    confirmation: string[];
    /** Paragraphs under none of the labels, kept in order. */
    other: string[];
}

/** Where an entry lives, without holding the document it was read from. */
export interface IEntryLocation {
    path: string;
    kind: MemoryKind;
    scope: string;
    id: string;
}

/** What a search asked of the index, ready to be recorded. */
export interface IRecordQuestionInput {
    query: string;
    hits: readonly IHindsightHit[];
    /** The area the search was filtered to, when it named one. */
    area?: string;
    /** `YYYY-MM-DD`. */
    date: string;
}

/** What recording a question produced. */
export interface IRecordedQuestion {
    id: string;
    /** Repository-relative path of the file it lives in. */
    path: string;
    area: string;
    /** True when the question had not been asked before. */
    created: boolean;
    /** How many times it has now been asked. */
    asked: number;
    status: string;
}

/** An answer to set on a question. */
export interface IAnswerInput {
    /** Answer paragraphs, already formatted. */
    answer: readonly string[];
    certainty: number;
    /** What the score covers. */
    rationale: readonly string[];
    /** True only when the answer is being written after it was checked. */
    confirmed?: boolean;
    /** What confirmed it, or why it has not been. */
    confirmation?: readonly string[];
}

/** What merging two questions produced. */
export interface IMergeResult {
    keepId: string;
    /** The ids that were folded in. */
    merged: string[];
    /** Repository-relative path of the entry that was kept. */
    path: string;
}

/**
 * Split a body into paragraphs.
 *
 * A field is a paragraph, not a line: the answer is wrapped when it is written, and a
 * parser that read lines would see a wrapped sentence as two of them.
 */
function blocksOf(lines: readonly string[]): string[][] {
    const blocks: string[][] = [];
    let block: string[] = [];
    for (const line of lines) {
        if (line.trim() === '') {
            if (block.length > 0) blocks.push(block);
            block = [];
            continue;
        }
        block.push(line);
    }
    if (block.length > 0) blocks.push(block);
    return blocks;
}

/** Collapse a paragraph's lines into one text. */
function flatten(block: readonly string[]): string {
    return block.join(' ').replace(/\s+/g, ' ').trim();
}

/** Read one `Asked:` value, or `null` when it is not one. */
function parseAsked(value: string): IFaqAsked | null {
    const match = ASKED.exec(value);
    if (!match?.groups) return null;
    const date = match.groups['date']!;
    const count = Number(match.groups['count'] ?? 1);
    const query = (match.groups['query'] ?? '')
        .trim()
        .replace(/^["“]|["”]$/g, '')
        .trim();
    return {date, count: Number.isFinite(count) && count > 0 ? count : 1, query};
}

/** Read the targets of an `Evidence:` value; `none` and anything unreadable yield nothing. */
function parseEvidence(value: string): IFaqEvidence[] {
    const found: IFaqEvidence[] = [];
    for (const match of value.matchAll(EVIDENCE)) {
        const target = match.groups?.['target']?.trim();
        if (!target || target === 'none') continue;
        const score = Number(match.groups?.['score'] ?? NaN);
        found.push({target, score: Number.isFinite(score) ? score : null});
    }
    return found;
}

/** Parse an FAQ entry body into its parts. */
export function parseFaqBody(body: readonly string[]): IFaqBody {
    const parts: IFaqBody = {
        asked: [],
        answer: [],
        evidence: null,
        certainty: null,
        rationale: [],
        confirmed: null,
        confirmation: [],
        other: [],
    };
    let current: 'answer' | 'rationale' | 'confirmation' | 'other' = 'other';

    for (const block of blocksOf(body)) {
        const text = flatten(block);
        if (text === '') continue;
        const label = LABEL.exec(text);
        if (!label?.groups) {
            if (current === 'answer') parts.answer.push(text);
            else if (current === 'rationale') parts.rationale.push(text);
            else if (current === 'confirmation') parts.confirmation.push(text);
            else parts.other.push(text);
            continue;
        }
        const value = text.slice(label[0].length).trim();
        switch (label.groups['label']) {
            case 'Asked': {
                const asked = parseAsked(value);
                if (asked) parts.asked.push(asked);
                current = 'other';
                break;
            }
            case 'Answer':
                current = 'answer';
                if (value !== '') parts.answer.push(value);
                break;
            case 'Evidence':
                parts.evidence = [...(parts.evidence ?? []), ...parseEvidence(value)];
                current = 'other';
                break;
            case 'Certainty': {
                current = 'rationale';
                const head = value.split(/\s+/)[0] ?? '';
                const score = Number.parseFloat(head);
                if (Number.isFinite(score)) parts.certainty = score;
                const note = /—\s*(?<note>.+)$/.exec(value)?.groups?.['note'];
                if (note) parts.rationale.push(note.trim());
                break;
            }
            case 'Confirmed': {
                current = 'confirmation';
                const verdict = /^(?<verdict>yes|no)\b/i.exec(value)?.groups?.['verdict'];
                parts.confirmed = verdict === undefined ? null : verdict.toLowerCase() === 'yes';
                const note = /—\s*(?<note>.+)$/.exec(value)?.groups?.['note'];
                if (note) parts.confirmation.push(note.trim());
                break;
            }
        }
    }
    return parts;
}

/** One evidence token: `@@F-316 (0.742)`. */
function renderEvidence(evidence: IFaqEvidence): string {
    const score = evidence.score === null ? '' : ` (${evidence.score.toFixed(3)})`;
    return `@@${evidence.target}${score}`;
}

/** Render a body into its canonical lines. */
export function renderFaqBody(parts: Partial<IFaqBody>): string[] {
    const lines: string[] = [];
    const paragraph = (text: string, label?: string) => {
        const value = text.trim();
        if (value === '') return;
        if (lines.length > 0) lines.push('');
        lines.push(...wrapText(label ? `${label}: ${value}` : value));
    };

    for (const asked of parts.asked ?? []) {
        const times = asked.count > 1 ? ` ×${asked.count}` : '';
        paragraph(`${asked.date}${times} — "${asked.query}"`, 'Asked');
    }

    const answer = parts.answer ?? [];
    answer.forEach((text, position) => paragraph(text, position === 0 ? 'Answer' : undefined));

    const evidence = parts.evidence;
    if (evidence !== undefined && evidence !== null) {
        paragraph(
            evidence.length === 0
                ? 'none — the search matched nothing'
                : evidence.map(renderEvidence).join(' '),
            'Evidence',
        );
    }

    if (parts.certainty !== null && parts.certainty !== undefined) {
        const [first, ...rest] = parts.rationale ?? [];
        paragraph(`${parts.certainty.toFixed(2)}${first ? ` — ${first}` : ''}`, 'Certainty');
        for (const text of rest) paragraph(text);
    }

    if (parts.confirmed !== null && parts.confirmed !== undefined) {
        const [first, ...rest] = parts.confirmation ?? [];
        paragraph(`${parts.confirmed ? 'yes' : 'no'}${first ? ` — ${first}` : ''}`, 'Confirmed');
        for (const text of rest) paragraph(text);
    }

    for (const text of parts.other ?? []) paragraph(text);
    return lines;
}

/**
 * Fold the endings that separate two spellings of one word: `move`, `moves`, `moved`
 * and `moving` are the same token, because a question rephrased in the gerund is the
 * question that was already answered.
 *
 * Deliberately crude — a real word-stemming library would be a dependency for a comparison
 * whose only job is to keep one entry per question.
 */
function stem(word: string): string {
    let stemmed = word;
    if (/(?:ing|ed)$/.test(word) && word.length > 5) stemmed = word.replace(/(?:ing|ed)$/, '');
    else if (/es$/.test(word) && word.length > 4) stemmed = word.slice(0, -2);
    else if (/s$/.test(word) && !/ss$/.test(word) && word.length > 3) stemmed = word.slice(0, -1);
    return stemmed.replace(/e$/, '');
}

/** The words of a question that carry its meaning. */
export function tokensOf(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .filter(word => word !== '' && !NOISE_WORDS.has(word))
        .map(stem)
        .filter(word => word !== '');
}

/** A question reduced to its words, in a stable order — the key two questions share. */
export function questionKey(text: string): string {
    return [...new Set(tokensOf(text))].sort().join(' ');
}

/** How much two questions overlap, as the Jaccard index of their words. */
export function questionSimilarity(left: string, right: string): number {
    const a = new Set(tokensOf(left));
    const b = new Set(tokensOf(right));
    if (a.size === 0 || b.size === 0) return 0;
    let common = 0;
    for (const word of a) if (b.has(word)) common += 1;
    return common / (a.size + b.size - common);
}

/** A search text turned into an entry title: one line, a question, at most 80 columns. */
export function questionTitle(query: string): string {
    const clean = query
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^["'`]+|["'`]+$/g, '')
        .replace(/[.?!]+$/, '')
        .trim();
    if (clean === '') return 'Unnamed question?';
    const title = `${clean[0]!.toUpperCase()}${clean.slice(1)}?`;
    if (title.length <= MAX_TITLE_LENGTH) return title;
    const cut = title.slice(0, MAX_TITLE_LENGTH - 1);
    const space = cut.lastIndexOf(' ');
    return `${(space > 20 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** How many `@@` citations a paragraph carries. */
export function citationsIn(text: string): number {
    return [...text.matchAll(new RegExp(CITATION.source, 'g'))].length;
}

/** The page or skill a repository path names, as an evidence target. */
function targetOfPath(path: string): string | null {
    const docs = `${DOCS_ROOT}/`;
    if (path.startsWith(docs) && path.endsWith('.md')) {
        return `doc:${path.slice(docs.length).replace(/\.md$/, '')}`;
    }
    const skills = `${SKILLS_ROOT}/`;
    if (path.startsWith(skills) && path.endsWith('/SKILL.md')) {
        return `skill:${path.slice(skills.length).slice(0, -'/SKILL.md'.length)}`;
    }
    return null;
}

/** The identifier a search hit names, or `null` when it names none this file can cite. */
export function targetOfHit(hit: IHindsightHit): string | null {
    const id = tagValue(hit.tags, 'id');
    if (id && MEMORY_ID.test(id)) return id;
    const path = tagValue(hit.tags, 'path');
    return path ? targetOfPath(path) : null;
}

/** The distinct identifiers a result set names, best score first. */
export function evidenceOfHits(hits: readonly IHindsightHit[]): IFaqEvidence[] {
    const found = new Map<string, IFaqEvidence>();
    for (const hit of hits) {
        const target = targetOfHit(hit);
        if (!target) continue;
        const previous = found.get(target);
        if (!previous) {
            found.set(target, {target, score: hit.similarity});
        } else if (
            hit.similarity !== null &&
            (previous.score === null || hit.similarity > previous.score)
        ) {
            previous.score = hit.similarity;
        }
    }
    return [...found.values()]
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
        .slice(0, MAX_EVIDENCE);
}

/** The union of two evidence lists, each target kept once at its best score. */
export function mergeEvidence(
    left: readonly IFaqEvidence[],
    right: readonly IFaqEvidence[],
): IFaqEvidence[] {
    const found = new Map<string, IFaqEvidence>();
    for (const item of [...left, ...right]) {
        const previous = found.get(item.target);
        if (!previous) {
            found.set(item.target, {...item});
        } else if (
            item.score !== null &&
            (previous.score === null || item.score > previous.score)
        ) {
            previous.score = item.score;
        }
    }
    return [...found.values()]
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
        .slice(0, MAX_EVIDENCE);
}

/** The area a result set points at: the first known one, in the bank's own order. */
export function areaOfHits(root: string, hits: readonly IHindsightHit[]): string | null {
    for (const hit of hits) {
        const area = tagValue(hit.tags, 'area');
        if (area && isKnownArea(root, area)) return area;
    }
    return null;
}

/** Read one entry out of its file, refusing a file that no longer holds it. */
function entryOf(location: IEntryLocation): {doc: IMemoryDoc; entry: IMemoryEntry} {
    const doc = readDoc(location.path, location.kind, location.scope);
    const problem = migrationProblem(doc);
    if (problem) throw new UsageError(problem);
    const entry = parseDoc(doc.lines).entries.find(candidate => candidate.id === location.id);
    if (!entry) throw new UsageError(`${location.id} is no longer in ${location.path}`);
    if (!entry.meta) throw new UsageError(`${location.id} has no meta line — run \`memory check\``);
    return {doc, entry};
}

/** Rewrite an entry from parsed parts, in the section its status belongs to. */
function rewrite(
    doc: IMemoryDoc,
    entry: IMemoryEntry,
    status: string,
    parts: Partial<IFaqBody>,
): void {
    removeEntry(doc, entry);
    insertEntry(
        doc,
        sectionForStatus(status),
        entryLines(entry.id, entry.title, {...entry.meta!, status}, renderFaqBody(parts)),
    );
    refreshIndex(doc);
    writeDoc(doc);
}

/** A question already in the files, with how well it matches. */
interface IQuestionMatch extends IEntryLocation {
    title: string;
    area: string;
    status: string;
    similarity: number;
    exact: boolean;
}

/** Every FAQ entry in the workspace, in file order. */
function faqEntries(root: string): Array<{location: IEntryLocation; entry: IMemoryEntry}> {
    const found: Array<{location: IEntryLocation; entry: IMemoryEntry}> = [];
    for (const file of listMemoryFiles(root)) {
        if (file.kind !== 'faq') continue;
        const doc = readDoc(file.path, file.kind, file.scope);
        for (const entry of parseDoc(doc.lines).entries) {
            const location: IEntryLocation = {
                path: file.path,
                kind: file.kind,
                scope: file.scope,
                id: entry.id,
            };
            found.push({location, entry});
        }
    }
    return found;
}

/**
 * The entry that already asks this question, or `null`.
 *
 * Exact word-for-word equality is checked first, so a repeated search always lands on
 * the entry it created; a rephrasing lands on the entry whose words overlap enough to be
 * the same question, which is what stops a paraphrase from starting a second record.
 */
export function findQuestion(root: string, query: string): IQuestionMatch | null {
    const key = questionKey(query);
    let best: IQuestionMatch | null = null;
    for (const {location, entry} of faqEntries(root)) {
        const similarity = questionSimilarity(query, entry.title);
        const exact = key !== '' && questionKey(entry.title) === key;
        if (!exact && similarity < SAME_QUESTION_SIMILARITY) continue;
        const candidate: IQuestionMatch = {
            ...location,
            title: entry.title,
            area: entry.meta?.area ?? 'cross-cutting',
            status: entry.meta?.status ?? 'open',
            similarity,
            exact,
        };
        if (best === null) best = candidate;
        else if (exact && !best.exact) best = candidate;
        else if (exact === best.exact && similarity > best.similarity) best = candidate;
    }
    return best;
}

/**
 * Record a search as a question, updating the entry it already has.
 *
 * A new question starts `open` — it has been asked and not yet answered — and carries
 * the identifiers the bank returned, so the answer can be written against them later.
 * A repeat adds to its `Asked:` count and folds the new result set into its evidence;
 * an answer already on the entry is never touched by a search.
 */
export async function recordQuestion(
    root: string,
    input: IRecordQuestionInput,
): Promise<IRecordedQuestion> {
    const query = input.query.replace(/\s+/g, ' ').trim();
    if (query === '') throw new UsageError('a question needs text to record');
    const evidence = evidenceOfHits(input.hits);
    const match = findQuestion(root, query);

    if (match) {
        const {doc, entry} = entryOf(match);
        const body = parseFaqBody(entry.body);
        const asked = [...body.asked];
        const at = asked.findIndex(item => questionKey(item.query) === questionKey(query));
        const count = at >= 0 ? asked[at]!.count + 1 : 1;
        if (at >= 0) asked[at] = {...asked[at]!, date: input.date, count};
        else asked.push({date: input.date, count: 1, query});
        rewrite(doc, entry, entry.meta!.status, {
            ...body,
            asked,
            evidence: mergeEvidence(body.evidence ?? [], evidence),
        });
        await ingestEntries(root, [{doc, id: entry.id}]);
        return {
            id: entry.id,
            path: relative(root, doc.path),
            area: entry.meta!.area,
            created: false,
            asked: count,
            status: entry.meta!.status,
        };
    }

    const area =
        input.area && isKnownArea(root, input.area) ? input.area : areaOrRoot(root, input.hits);
    const result = await addMemoryEntry(root, {
        kind: 'faq',
        title: questionTitle(query),
        area,
        date: input.date,
        body: renderFaqBody({
            asked: [{date: input.date, count: 1, query}],
            evidence,
        }),
    });
    return {
        id: result.id,
        path: result.path,
        area: result.area,
        created: true,
        asked: 1,
        status: result.status,
    };
}

/** The area a new question is filed under: the one its hits point at, else the root. */
function areaOrRoot(root: string, hits: readonly IHindsightHit[]): string {
    return areaOfHits(root, hits) ?? 'cross-cutting';
}

/**
 * Set the answer of a question, and the certainty it is held with.
 *
 * The answer is refused when the entry has evidence and the prose cites none of it: an
 * answer that restates what an entry already says drifts from it on the next edit, while
 * one that points at the entry stays true for as long as the entry does. A question the
 * index knew nothing about has no evidence to cite, and an answer saying so is allowed.
 *
 * The answer is recorded **unconfirmed** unless the caller says otherwise: a conclusion drawn
 * from a result set is a lead, and only reading the cited entry, grepping the code or running
 * the test turns it into an answer a later reader can rely on. The entry carries that fact
 * itself, so no reader has to guess, and `memory confirm` is what changes it.
 */
export async function answerQuestion(
    root: string,
    location: IEntryLocation,
    input: IAnswerInput,
): Promise<{id: string; path: string; citations: number; confirmed: boolean}> {
    if (location.kind !== 'faq') throw new UsageError(`${location.id} is not an faq entry`);
    const answer = input.answer.map(paragraph => paragraph.trim()).filter(Boolean);
    if (answer.length === 0) throw new UsageError('an answer needs text');
    if (!Number.isFinite(input.certainty) || input.certainty < 0 || input.certainty > 1) {
        throw new UsageError(`--certainty must be between 0 and 1, not "${input.certainty}"`);
    }

    const {doc, entry} = entryOf(location);
    const body = parseFaqBody(entry.body);
    const citations = answer.reduce((total, paragraph) => total + citationsIn(paragraph), 0);
    const evidence = body.evidence ?? [];
    if (evidence.length > 0 && citations === 0) {
        throw new UsageError(
            'the answer cites no @@ reference — point at the entry or page that holds it ' +
                `(${evidence
                    .slice(0, 3)
                    .map(item => `@@${item.target}`)
                    .join(' ')}) instead of restating it`,
        );
    }

    const confirmed = input.confirmed ?? false;
    const confirmation = [...(input.confirmation ?? [])];
    if (!confirmed && confirmation.length === 0) confirmation.push(UNCONFIRMED_NOTE);

    rewrite(doc, entry, 'answered', {
        ...body,
        answer,
        certainty: input.certainty,
        rationale: [...input.rationale],
        confirmed,
        confirmation,
    });
    await ingestEntries(root, [{doc, id: entry.id}]);
    return {id: entry.id, path: relative(root, doc.path), citations, confirmed};
}

/**
 * Record that follow-up work confirmed an answer.
 *
 * This is the second half of the rule: an answer is written as a lead and confirmed by whatever
 * actually checks it — the cited entry read, the code grepped, the test run. The note says what
 * did the checking, because "confirmed" with no method is another claim nobody can weigh.
 */
export async function confirmQuestion(
    root: string,
    location: IEntryLocation,
    note: readonly string[],
): Promise<{id: string; path: string; already: boolean}> {
    if (location.kind !== 'faq') throw new UsageError(`${location.id} is not an faq entry`);
    const {doc, entry} = entryOf(location);
    const body = parseFaqBody(entry.body);
    if (body.answer.length === 0) {
        throw new UsageError(
            `${entry.id} has no answer yet — answer it first with \`memory answer ${entry.id}\``,
        );
    }
    if (body.confirmed === true && note.length === 0) {
        return {id: entry.id, path: relative(root, doc.path), already: true};
    }

    rewrite(doc, entry, entry.meta!.status, {
        ...body,
        confirmed: true,
        confirmation: note.length > 0 ? [...note] : body.confirmation,
    });
    await ingestEntries(root, [{doc, id: entry.id}]);
    return {id: entry.id, path: relative(root, doc.path), already: false};
}

/** The `Asked:` lines of several entries, one line per distinct question wording. */
function mergeAsked(left: readonly IFaqAsked[], right: readonly IFaqAsked[]): IFaqAsked[] {
    const merged = [...left];
    for (const asked of right) {
        const at = merged.findIndex(item => questionKey(item.query) === questionKey(asked.query));
        if (at < 0) {
            merged.push(asked);
            continue;
        }
        const previous = merged[at]!;
        merged[at] = {
            query: previous.query,
            count: previous.count + asked.count,
            date: previous.date >= asked.date ? previous.date : asked.date,
        };
    }
    return merged;
}

/**
 * Fold duplicate questions into one entry.
 *
 * The kept entry absorbs the others' `Asked:` records and evidence, and takes an answer
 * from a duplicate when it has none of its own — a question answered once is answered.
 * Each duplicate leaves its id in its own file's `## Retired` ledger, naming the survivor
 * as its successor, so a citation of it becomes a warning that says where to look instead
 * of a dangling id.
 */
export async function mergeFaqEntries(
    root: string,
    keep: IEntryLocation,
    duplicates: readonly IEntryLocation[],
    options: {date: string; reason?: string},
): Promise<IMergeResult> {
    if (keep.kind !== 'faq') throw new UsageError(`${keep.id} is not an faq entry`);
    if (duplicates.length === 0)
        throw new UsageError('a merge needs at least one entry to fold in');
    if (duplicates.some(duplicate => duplicate.id === keep.id)) {
        throw new UsageError(`${keep.id} cannot be merged into itself`);
    }

    const {doc, entry} = entryOf(keep);
    const parts = parseFaqBody(entry.body);
    const merged: string[] = [];

    for (const duplicate of duplicates) {
        if (duplicate.kind !== 'faq') {
            throw new UsageError(`${duplicate.id} is not an faq entry`);
        }
        const other = parseFaqBody(entryOf(duplicate).entry.body);
        parts.asked = mergeAsked(parts.asked, other.asked);
        parts.evidence = mergeEvidence(parts.evidence ?? [], other.evidence ?? []);
        if (parts.answer.length === 0) {
            parts.answer = [...other.answer];
            parts.certainty = other.certainty;
            parts.rationale = [...other.rationale];
        }
        // A confirmation belongs to the conclusion, not to the wording: an answer carried over
        // from a duplicate that was checked is confirmed here too, while an unconfirmed one stays
        // unconfirmed — a merge is never what settles a question.
        if (parts.confirmed !== true && other.confirmed === true) {
            parts.confirmed = true;
            parts.confirmation = [...other.confirmation];
        }
        parts.other = [...parts.other, ...other.other];
        merged.push(duplicate.id);
    }

    const status =
        parts.answer.length > 0 && parts.certainty !== null ? 'answered' : entry.meta!.status;
    if (status === 'answered' && parts.confirmed === null) {
        parts.confirmed = false;
        parts.confirmation =
            parts.confirmation.length > 0 ? parts.confirmation : [UNCONFIRMED_NOTE];
    }
    rewrite(doc, entry, status, parts);
    await ingestEntries(root, [{doc, id: entry.id}]);

    for (const duplicate of duplicates) {
        const gone = entryOf(duplicate);
        removeEntry(gone.doc, gone.entry);
        retireEntry(
            gone.doc,
            duplicate.id,
            `merged into ${keep.id} (${options.date})${options.reason ? ` — ${options.reason}` : ''}`,
        );
        refreshIndex(gone.doc);
        writeDoc(gone.doc);
    }
    await forgetEntries(merged);

    return {keepId: keep.id, merged, path: relative(root, doc.path)};
}

/**
 * The body of a newly created question, for `memory add faq`.
 *
 * A hand-written question must look like a recorded one, or `check` refuses it and the
 * file holds two shapes of the same entry. This is the recorded shape, with the question
 * it was told to ask.
 */
export function questionBody(query: string, date: string): string[] {
    return renderFaqBody({asked: [{date, count: 1, query: query.trim()}]});
}
