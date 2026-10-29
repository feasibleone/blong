import type {IFeedbackItem, IFeedbackSession} from '@feasibleone/blong';
import {library} from '@feasibleone/blong';

/**
 * prose.ts — the Markdown document a coding agent receives (`@@T-470`).
 *
 * Rendered from the stored rows every time it is asked for, never persisted
 * (`@@D-660`), over a selection of sessions rather than one at a time
 * (`@@D-663`). The shape is a contract: an agent greps the document for the
 * identifiers in the trailing block, and the golden test in
 * `realm/blong-feedback/server/test` fails when it changes.
 *
 * One submission is written as a section, its items as subsections in the order
 * the boxes were made, and the wording is quoted verbatim — a reviewer's
 * `refinedText` stands in for the person's `commentText` when it exists, because
 * making the report actionable is what the review is for.
 *
 * Items the reviewer closed are left out: the row stays for the record, the
 * document does not carry a comment nobody wants acted on (`@@T-496`).
 */

/** One stored session with the items that belong to it. */
export interface IProseEntry {
    session: IFeedbackSession;
    items: IFeedbackItem[];
}

/** The document starts with this line; a change to the format must change it. */
export const PROSE_VERSION = 'blong-feedback v1';

/** `2026-10-20T09:12:00.000Z` → `2026-10-20 09:12` (UTC, so the output is stable). */
function stamp(value: string | Date | undefined): string {
    if (!value) return 'unknown';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
        `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
        `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
    );
}

/** `sport.athlete.browse (Athletes)` — the page a session names, or its URL. */
function pageOf(session: IFeedbackSession): string {
    const parts = [session.pageSubject, session.pageObject, session.pageKind].filter(
        (part): part is string => Boolean(part),
    );
    const name = parts.length ? parts.join('.') : session.pageUrl;
    return session.pageTitle ? `${name} (${session.pageTitle})` : name;
}

/** The wording of one item: the reviewer's clarification first, then the person's words. */
export function wordingOf(item: IFeedbackItem): string {
    const refined = item.refinedText?.trim();
    return refined ? refined : (item.commentText ?? '').trim();
}

/**
 * Render a batch as one Markdown document.
 *
 * The entries are written in the order they are given; the caller sorts them
 * (the handler sorts by submission time). Items are written by `itemIndex`, and
 * an item without one keeps its position in the array.
 */
export function renderProse(entries: IProseEntry[]): string {
    const kept = entries
        .map(entry => ({...entry, items: entry.items.filter(item => !item.removedAt)}))
        .filter(entry => entry.items.length > 0);
    entries = kept;
    const itemCount = entries.reduce((total, entry) => total + entry.items.length, 0);
    const lines: string[] = [
        `<!-- ${PROSE_VERSION} -->`,
        `# Feedback — ${entries.length} submission${entries.length === 1 ? '' : 's'}, ` +
            `${itemCount} item${itemCount === 1 ? '' : 's'}`,
        '',
    ];

    const identifiers: string[] = [];

    for (const {session, items} of entries) {
        lines.push(
            `## ${pageOf(session)} — ${items.length} item${items.length === 1 ? '' : 's'}`,
            '',
            `- Session: \`${session.sessionId}\``,
            `- Submitted: ${stamp(session.submittedAt)}`,
            `- Screenshot: ${session.shotStatus}`,
            `- Page: \`${session.pageUrl}\``,
        );
        if (session.userResourceId) lines.push(`- Submitted by: \`${session.userResourceId}\``);
        if (session.languageCode) lines.push(`- Language: ${session.languageCode}`);
        lines.push('');

        const ordered = items
            .map((item, position) => ({item, position}))
            .sort(
                (a, b) =>
                    (a.item.itemIndex ?? a.position) - (b.item.itemIndex ?? b.position) ||
                    a.position - b.position,
            );

        for (const [index, {item}] of ordered.entries()) {
            const label = item.targetLabel ? ` — ${item.targetKind} "${item.targetLabel}"` : '';
            lines.push(
                `### ${index + 1}. \`${item.targetId}\`${label}`,
                '',
                `> ${wordingOf(item).replace(/\n/g, '\n> ')}`,
                '',
            );
            identifiers.push(item.targetId);
        }
    }

    if (identifiers.length) {
        lines.push(
            '## Target identifiers',
            '',
            'Every identifier above is the path to the element it is about: the page it was found',
            'on, then one step per container down to the thing itself —',
            '`sport.club.open/card:clubDetails/field:clubShortName` is a field in a card of that',
            'page. Search for the last named step to land on it.',
            '',
            '```text',
            ...[...new Set(identifiers)],
            '```',
            '',
        );
    }

    return lines.join('\n');
}

/**
 * Injected as `lib.renderProse`.
 *
 * A file inside a handler group must default-export a handler or a library — the
 * loader refuses a plain module there and logs that it "probably" is generic
 * source in the wrong folder — and a library is the right shape anyway: the
 * renderer is a pure function the handlers borrow, not a dependency they import.
 */
export type ProseLib = {renderProse: typeof renderProse};

export default library((): ProseLib => ({renderProse}));
