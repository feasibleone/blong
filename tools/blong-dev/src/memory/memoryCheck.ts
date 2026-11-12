/**
 * Validation of the memory files — the gate that keeps them readable and
 * lint-clean without anyone remembering the format.
 *
 * The rules are deliberately mechanical: everything here is either derived
 * (index in sync), structural (section matches status) or a formatting rule the
 * wrapper can fix. Spelling is checked separately, by cspell, from the command.
 */

import {DUPLICATE_SIMILARITY, citationsIn, parseFaqBody, questionSimilarity} from './memoryFaq.ts';
import {indexIsCurrent} from './memoryIndex.ts';
import {checkMarkdown} from './memoryMarkdown.ts';
import {parseDoc} from './memoryParse.ts';
import {isReservedArea} from './memoryPaths.ts';
import {
    INDEX_END,
    INDEX_START,
    KIND_SECTIONS,
    KIND_STATUSES,
    KIND_TITLE,
    LINE_REFERENCE,
    MAX_LINE_LENGTH,
    MAX_TITLE_LENGTH,
    SECTION_FOR_STATUS,
    ledgerIdOf,
    type IMemoryDoc,
    type IMemoryStructure,
} from './memoryTypes.ts';

export interface IProblem {
    file: string;
    /** 1-based line number, or 0 for a file-level problem. */
    line: number;
    message: string;
    severity: 'error' | 'warning';
}

export interface ICheckContext {
    /** id → the file that owns it, across every memory file in the workspace. */
    ids: Map<string, string>;
    /** Package folders, for validating areas. */
    packages: Set<string>;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Longest answer, in words, before it is a copy of the evidence rather than a pointer to it. */
const MAX_ANSWER_WORDS = 120;

/** True when the line must stay on one line: fences, tables, headings, comments. */
function mustStayOnOneLine(line: string): boolean {
    return (
        /^\s*(?:```|~~~)/.test(line) ||
        /^#{1,6}\s/.test(line) ||
        /^\s*\|/.test(line) ||
        /^\s*<!--/.test(line) ||
        /^\s{4,}\S/.test(line)
    );
}

/** Every problem in one document, in file order. */
export function checkDoc(doc: IMemoryDoc, context: ICheckContext): IProblem[] {
    const problems: IProblem[] = [];
    const report = (line: number, message: string, severity: IProblem['severity'] = 'error') =>
        problems.push({file: doc.path, line, message, severity});

    const structure = parseDoc(doc.lines);
    const expectedTitle =
        doc.scope === 'root' ? KIND_TITLE[doc.kind] : `${KIND_TITLE[doc.kind]} — ${doc.scope}`;
    if (structure.title !== expectedTitle) {
        report(1, `title should be "# ${expectedTitle}" (found "${structure.title ?? '(none)'}")`);
    }

    const starts = doc.lines.filter(line => line.trim() === INDEX_START).length;
    const ends = doc.lines.filter(line => line.trim() === INDEX_END).length;
    if (starts !== 1 || ends !== 1) {
        report(
            0,
            `expected exactly one index block, found ${starts} start and ${ends} end marker(s)`,
        );
    } else if (!indexIsCurrent(doc.lines, structure, doc.kind)) {
        report(0, 'the generated index is out of date — run `blong-dev memory index`');
    }

    for (const entry of structure.entries) {
        const line = entry.start + 1;
        const owner = context.ids.get(entry.id);
        if (owner && owner !== doc.path) {
            report(line, `id ${entry.id} is also used in ${owner}`);
        }
        if (entry.title.length > MAX_TITLE_LENGTH) {
            report(
                line,
                `title is ${entry.title.length} characters (max ${MAX_TITLE_LENGTH})`,
                'warning',
            );
        }
        const meta = entry.meta;
        if (!meta) {
            report(line, 'missing or malformed meta line `> _<date> · <area> · <status>_`');
            continue;
        }
        if (!ISO_DATE.test(meta.date)) report(line, `meta date "${meta.date}" is not YYYY-MM-DD`);
        if (!KIND_STATUSES[doc.kind].includes(meta.status)) {
            report(
                line,
                `status "${meta.status}" is not one of ${KIND_STATUSES[doc.kind].join(', ')}`,
            );
        }
        if (!isReservedArea(meta.area) && !context.packages.has(meta.area)) {
            report(
                line,
                `unknown area "${meta.area}" — expected a package folder or a reserved label`,
            );
        }
        if (!isReservedArea(meta.area) && doc.scope === 'root') {
            report(
                line,
                `area "${meta.area}" belongs in that package's memory, not the root file`,
                'warning',
            );
        }
        const expectedSection = SECTION_FOR_STATUS[meta.status];
        if (expectedSection && expectedSection !== entry.section) {
            report(line, `entry with status "${meta.status}" belongs in "## ${expectedSection}"`);
        }
    }

    for (const section of structure.sections) {
        if (!KIND_SECTIONS[doc.kind].includes(section.heading)) {
            report(section.start + 1, `unknown section "## ${section.heading}"`, 'warning');
        }
    }

    if (doc.kind === 'faq') reportQuestions(structure, report);

    // The retired ledger: each line names an id once, and no id is both an entry and a
    // retired id in the same file — a number either belongs to an entry or it does not.
    const ledger = new Map<string, number>();
    doc.lines.forEach((line, index) => {
        const retired = ledgerIdOf(line);
        if (!retired) return;
        if (ledger.has(retired)) report(index + 1, `the ledger records ${retired} twice`);
        ledger.set(retired, index + 1);
    });
    for (const entry of structure.entries) {
        const at = ledger.get(entry.id);
        if (at !== undefined) report(at, `${entry.id} is both an entry and a retired id`);
    }

    const fenced: boolean[] = [];
    let inFence = false;
    doc.lines.forEach((line, index) => {
        if (/^\s*(?:```|~~~)/.test(line)) {
            fenced.push(true);
            inFence = !inFence;
            return;
        }
        fenced.push(inFence);
    });

    doc.lines.forEach((line, index) => {
        if (fenced[index] || mustStayOnOneLine(line)) return;
        if (line.length <= MAX_LINE_LENGTH) return;
        const head = line.slice(0, MAX_LINE_LENGTH);
        if (!head.includes(' ')) return;
        report(
            index + 1,
            `line is ${line.length} characters and could be wrapped at ${MAX_LINE_LENGTH}`,
        );
    });

    doc.lines.forEach((line, index) => {
        const match = LINE_REFERENCE.exec(line);
        if (match) {
            report(
                index + 1,
                `reference by line number ("${match[0]}") rots — use the entry id instead`,
            );
        }
    });

    // Markdown formatting: what the editor's markdownlint reports and `lint` cannot.
    const manual = structure.sections.find(section => section.heading === 'Manual');
    const exempt = new Set<number>();
    if (structure.indexRange) {
        for (let line = structure.indexRange[0]; line <= structure.indexRange[1]; line += 1)
            exempt.add(line);
    }
    if (manual) {
        // The user's own items are kept exactly as they were written.
        for (let line = manual.start + 1; line <= manual.end; line += 1) exempt.add(line);
    }
    for (const problem of checkMarkdown(doc.lines, exempt)) {
        report(problem.line, `${problem.rule}: ${problem.message}`);
    }

    return problems;
}

/**
 * The rules a question has beyond the entry format.
 *
 * An FAQ entry is written by two different authors: the search records what was asked
 * and what it found, and a person or an agent writes the answer against that evidence.
 * The checks follow the split — an entry with no `Asked:` line was not recorded by the
 * command, an answered question with no citation is an answer that will drift from the
 * entry it was meant to summarise, and an answer with no `Confirmed:` line is one whose
 * reader cannot tell a lead from a conclusion.
 */
function reportQuestions(
    structure: IMemoryStructure,
    report: (line: number, message: string, severity?: IProblem['severity']) => void,
): void {
    for (const entry of structure.entries) {
        const line = entry.start + 1;
        const body = parseFaqBody(entry.body);
        if (body.asked.length === 0) {
            report(line, 'a question needs an `Asked:` line — `memory search` writes one');
        }
        if (body.certainty !== null && (body.certainty < 0 || body.certainty > 1)) {
            report(line, `certainty ${body.certainty} is outside 0–1`);
        }

        const status = entry.meta?.status;
        if (status === 'answered') {
            if (body.answer.length === 0) {
                report(line, 'an answered question needs an `Answer:` paragraph');
            } else {
                const answer = body.answer.join(' ');
                if (citationsIn(answer) === 0) {
                    report(
                        line,
                        'the answer cites nothing — point at the entry or page that holds it ' +
                            '(`@@F-316`, `@@doc:patterns/memory`)',
                    );
                }
                const words = answer.split(/\s+/).filter(Boolean).length;
                if (words > MAX_ANSWER_WORDS) {
                    report(
                        line,
                        `the answer is ${words} words — it points at its evidence instead of ` +
                            'restating it',
                        'warning',
                    );
                }
            }
            if (body.certainty === null) {
                report(line, 'an answered question needs a `Certainty:` line between 0 and 1');
            }
            if (body.confirmed === null) {
                report(
                    line,
                    'an answered question needs a `Confirmed: yes` or `Confirmed: no` line — ' +
                        'an answer is a lead until analysis or a run checks it ' +
                        '(`memory confirm` records that)',
                );
            }
        }
        if (status === 'open' && body.answer.length > 0) {
            report(
                line,
                'an answered question belongs in "## Answered" — run `memory answer`',
                'warning',
            );
        }
        if (status === 'open' && body.confirmed !== null) {
            report(
                line,
                'a `Confirmed:` line belongs to an answered question — run `memory answer` first',
                'warning',
            );
        }
    }

    // Two entries asking the same thing are one answer written twice, and the second drifts from
    // the first. The pair is reported with the command that settles it, because that is the work.
    for (let left = 0; left < structure.entries.length; left += 1) {
        for (let right = left + 1; right < structure.entries.length; right += 1) {
            const one = structure.entries[left]!;
            const other = structure.entries[right]!;
            const similarity = questionSimilarity(one.title, other.title);
            if (similarity < DUPLICATE_SIMILARITY) continue;
            report(
                other.start + 1,
                `${one.id} asks nearly the same question (${similarity.toFixed(2)}) — ` +
                    `merge them: \`memory merge ${one.id} ${other.id}\``,
                'warning',
            );
        }
    }
}

/** Format a problem for the console. */
export function describeProblem(problem: IProblem): string {
    const where = problem.line > 0 ? `${problem.file}:${problem.line}` : problem.file;
    return `${problem.severity === 'error' ? '❌' : '⚠️'} ${where}  ${problem.message}`;
}
