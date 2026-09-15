/**
 * Validation of the memory files — the gate that keeps them readable and
 * lint-clean without anyone remembering the format.
 *
 * The rules are deliberately mechanical: everything here is either derived
 * (index in sync), structural (section matches status) or a formatting rule the
 * wrapper can fix. Spelling is checked separately, by cspell, from the command.
 */

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
    type IMemoryDoc,
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

/** Format a problem for the console. */
export function describeProblem(problem: IProblem): string {
    const where = problem.line > 0 ? `${problem.file}:${problem.line}` : problem.file;
    return `${problem.severity === 'error' ? '✖' : '⚠'} ${where}  ${problem.message}`;
}
