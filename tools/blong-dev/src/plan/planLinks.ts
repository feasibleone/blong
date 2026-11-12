/**
 * The markdown link from a plan's task line to the memory entry that holds its detail.
 *
 * A plan keeps the titles and the memory keeps the bodies, so the task line names the id
 * and nothing else — which leaves a reader of the plan with a token they have to search
 * for. Making that token a link (`[@@T-634](../../realm/blong-chat/.github/memory/todo.md#t-634--…)`)
 * turns the board into a table of contents: the plan opens the entry in the editor, and
 * the same text, published as an issue, opens it on github.com.
 *
 * The two destinations need different targets. The plan is local and its link is
 * relative to the plan's own folder; an issue body is resolved by GitHub against the
 * repository root, so a `../` target that works in the editor leads nowhere there. The
 * plan therefore stores the relative form, and {@link issueLinks} rewrites it on the way
 * out.
 */

import {dirname, join, relative, sep} from 'node:path';

import type {IMemoryEntryView} from '../memory/memoryView.ts';

/** A link target that is relative to the file holding it. */
const RELATIVE_TARGET = /\]\((?<target>(?:\.{1,2}\/)+[^)\s]+)\)/g;

/**
 * The anchor GitHub gives a heading.
 *
 * GitHub lowercases the text, drops everything that is not a letter, a digit, a space, a
 * hyphen or an underscore, and turns each space into a hyphen — an em dash is dropped and
 * the spaces around it leave two hyphens behind, which is why a memory heading
 * `T-634 — Prove …` anchors as `t-634--prove-…`.
 */
export function githubAnchor(heading: string): string {
    return heading
        .trim()
        .toLowerCase()
        .replace(/<[^>]*>/g, '')
        .replace(/[^\p{L}\p{N}\s_-]/gu, '')
        .replace(/\s/g, '-');
}

/** The heading a memory entry is published under. */
export function entryHeading(id: string, title: string): string {
    return `${id} — ${title}`;
}

/** The link target for an entry, written the way the plan (and an editor) resolves it. */
export function entryLink(
    root: string,
    planPath: string,
    entry: Pick<IMemoryEntryView, 'id' | 'title' | 'path'>,
): string {
    const target = relative(dirname(planPath), join(root, entry.path)).split(sep).join('/');
    return `${target}#${githubAnchor(entryHeading(entry.id, entry.title))}`;
}

/**
 * Rewrite a plan's relative links so an issue resolves them on github.com.
 *
 * GitHub reads a relative link in an issue body from the repository root, while the plan
 * wrote it from `plans/<slug>/`, so `../../realm/…` has to lose its `../` and gain a
 * repository URL. Only relative targets are touched; a plan that already links to a URL
 * keeps it.
 */
export function issueLinks(markdown: string, repo: string): string {
    return markdown.replace(RELATIVE_TARGET, (_match: string, target: string) => {
        const path = target.replace(/^(?:\.{1,2}\/)+/, '');
        return `](https://github.com/${repo}/blob/HEAD/${path})`;
    });
}
