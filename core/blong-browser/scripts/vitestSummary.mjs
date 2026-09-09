#!/usr/bin/env node
/**
 * Summarises the blong-browser vitest run into `vitest-report/summary.md` in
 * the writeSummary-compatible heading format used by the shared rush.yaml
 * report aggregator, so component-test results appear as a row in the single
 * consolidated CI comment/summary (instead of vitest's terse built-in
 * "Vitest Test Report" step summary).
 *
 * Input:  coverage/vitest.json  (written by vitest's json reporter in ci-test)
 * Output: vitest-report/summary.md
 */
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';

const root = process.cwd();
const input = join(root, 'coverage', 'vitest.json');
const output = join(root, 'vitest-report', 'summary.md');

let data;
try {
    data = JSON.parse(readFileSync(input, 'utf8'));
} catch {
    console.warn('[vitestSummary] no coverage/vitest.json — skipping summary');
    process.exit(0);
}

const files = data.testResults ?? [];
const all = files.flatMap(f => f.assertionResults ?? []);
const sumStatus = status => all.filter(t => t.status === status).length;

const passed = Number(data.numPassedTests ?? sumStatus('passed'));
const failed = Number(data.numFailedTests ?? sumStatus('failed'));
const skipped = Number(data.numSkippedTests ?? sumStatus('skipped'));
const todo = Number(data.numTodoTests ?? sumStatus('todo'));
const total = Number(data.numTotalTests ?? passed + failed + skipped + todo);
const icon = failed > 0 ? '❌' : '✅';

const counts = [`${passed} passed`, `${failed} failed`];
if (skipped > 0) counts.push(`${skipped} skipped`);
if (todo > 0) counts.push(`${todo} todo`);

const fileResult = f => ((f.assertionResults ?? []).some(t => t.status === 'failed') ? '❌' : '✅');
const rows = files
    .map(
        f =>
            `| ${fileResult(f)} | \`${String(f.name ?? '')
                .split('/')
                .pop()}\` |`,
    )
    .join('\n');

const md = [
    `### ${icon} blong-browser — ${counts.join(', ')} (${total} total)`,
    '',
    `<details><summary>All test files (${files.length})</summary>`,
    '',
    '| Result | Test file |',
    '| --- | --- |',
    rows,
    '</details>',
    '',
].join('\n');

mkdirSync(dirname(output), {recursive: true});
writeFileSync(output, md);
console.log(`[vitestSummary] wrote ${output} (${passed} passed, ${failed} failed, ${total} total)`);
