/**
 * The markdown repair this repository already owns.
 *
 * A markdown file written by hand or by a command trips the same handful of rules every time — a
 * table whose pipes do not line up, a paragraph wrapped at 96 columns, an emphasis span in
 * asterisks — and the editor repairs them on save because `markdownlint` is registered as the
 * markdown formatter. A session that instead writes its own fixer spends its effort on the repair
 * and produces a script nobody keeps.
 *
 * So this is a call into `@feasibleone/blong-lint`'s `lintFix`, which is the same order the editor
 * applies: prettier (wrapping and table alignment), then `markdownlint --fix` (the mechanical
 * rules), then prettier again because markdownlint's fixes are not written to the configured
 * width. Commands that write a markdown document call this instead of building one.
 *
 * Memory files are deliberately not passed here: they are a *format* — a generated index, ids and
 * a `## Manual` section that must survive byte-for-byte — and `blong-dev memory format` is their
 * fixer (@@D-862).
 */

import {lintFix, type LintFixResult} from '@feasibleone/blong-lint';

import {pinnedPrettier} from './prettierBin.ts';

/**
 * Repair the named files, in the order that leaves them lint-clean.
 *
 * Never throws and never decides an exit code: a caller reports what was repaired and lets the
 * check that follows be the verdict.
 */
export async function fixMarkdown(cwd: string, files: readonly string[]): Promise<LintFixResult> {
    if (files.length === 0) return {ran: [], notes: []};
    const prettierBin = pinnedPrettier();
    return lintFix(cwd, files, {...(prettierBin ? {prettierBin} : {})});
}
