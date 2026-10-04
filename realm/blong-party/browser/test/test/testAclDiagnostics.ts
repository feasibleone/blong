import {handler, type IAssert, type IMeta} from '@feasibleone/blong';
import {featureToSteps, type IStepContext} from '@feasibleone/blong-cucumber';

import aclDiagnosticsFeature from '../feature/aclDiagnostics.ts';
import type {IAclFixtureResult} from './aclFixture.ts';
import {ACL_TARGET_PERSONS, type IAclMatrixResult} from './aclMatrix.ts';

/**
 * Browser-side ACL matrix diagnostics — group `test.acl.diagnostics`.
 *
 * The matrix features assert what the access *is*; this group asserts that a
 * failure is **readable**: it drives the real helper with a deliberately wrong
 * table and checks the report the reader would see.  Run in every suite run, so
 * the failure contract cannot rot silently — a report that stopped marking cells,
 * or started marking the wrong one, fails here rather than in a debugging session.
 *
 * What is asserted is the whole path: the probe goes through the gateway, the
 * comparison runs in `aclMatrix` / `aclFixture`, and the assertion below reads the
 * rendered report the same way a person does — by finding the row and the column.
 */

/** Split a rendered `| a | b |` line into its trimmed cells. */
function cellsOf(line: string): string[] {
    return line
        .split('|')
        .slice(1, -1)
        .map(cell => cell.trim());
}

/**
 * A mismatch line must be findable **in the table**: the marker `expected≠actual`
 * has to sit in that column of that row, not merely appear somewhere in the text.
 *
 * The line reads `<row> → <column>: expected X, got Y` for an access matrix and
 * `<record> · <predicate>: expected X, got Y` for a fixture table, so the caller
 * passes the separator it knows (` → ` or ` · `).
 */
function assertMismatchIsInItsCell(
    assert: IAssert,
    report: string,
    mismatch: string,
    separator: string,
): void {
    const [where, values = ''] = mismatch.split(': expected ');
    const [expected = '', got = ''] = values.split(', got ');
    const [row = '', column = ''] = where.split(separator).map(part => part.trim());
    const marker = `${expected}≠${got}`;
    const lines = report.split('\n').map(cellsOf);
    const header = lines.find(cells => cells.includes(column));
    const columnAt = header?.indexOf(column) ?? -1;
    // The row label is the tree column, which may carry box-drawing glyphs.
    const rowCells = lines.find(
        cells => cells.length > 1 && (cells[0] === row || cells[0].endsWith(row)),
    );
    assert.ok(rowCells, `the report redraws the row "${row}"`);
    assert.ok(columnAt >= 0, `the report redraws the column "${column}"`);
    assert.equal(
        rowCells?.[columnAt],
        marker,
        `the marker ${marker} sits in the "${column}" cell of the "${row}" row`,
    );
}

export default handler(({lib: {group, aclFixture, aclMatrix}}) => ({
    testAclDiagnostics: ({name = 'acl diagnostics'}: {name?: string} = {}) =>
        featureToSteps(
            aclDiagnosticsFeature,
            {
                'probing the access matrix reports every mismatch in its own cell': (
                    step: IStepContext,
                ) =>
                    async function matrixMismatchIsInItsCell(
                        assert: IAssert,
                        {$meta}: {$meta: IMeta},
                    ) {
                        const result = await aclMatrix<IAclMatrixResult>(
                            {
                                table: step.dataTable ?? [],
                                probe: 'party.person.get',
                                target: ACL_TARGET_PERSONS,
                            },
                            $meta,
                        );
                        assert.equal(result.ok, false, 'a wrong cell is reported at all');
                        assert.ok(result.mismatches.length > 0, 'and it is named as a mismatch');
                        const report = result.render();
                        assert.ok(
                            report.includes('Mismatches:'),
                            'the report lists the mismatches',
                        );
                        for (const mismatch of result.mismatches) {
                            assertMismatchIsInItsCell(assert, report, mismatch, ' → ');
                        }
                    },

                'probing the ACL fixture reports every mismatch in its own cell': (
                    step: IStepContext,
                ) =>
                    async function fixtureMismatchIsInItsCell(
                        assert: IAssert,
                        {$meta}: {$meta: IMeta},
                    ) {
                        const result = await aclFixture<IAclFixtureResult>(
                            {table: step.dataTable ?? [], title: 'the ACL fixture'},
                            $meta,
                        );
                        assert.equal(result.ok, false, 'a wrong row is reported at all');
                        assert.ok(result.mismatches.length > 0, 'and it is named as a mismatch');
                        const report = result.render();
                        assert.ok(
                            report.includes('Mismatches:'),
                            'the report lists the mismatches',
                        );
                        for (const mismatch of result.mismatches) {
                            assertMismatchIsInItsCell(assert, report, mismatch, ' · ');
                        }
                    },

                'probing the access matrix reports no mismatch': (step: IStepContext) =>
                    async function matrixReportsNothing(assert: IAssert, {$meta}: {$meta: IMeta}) {
                        const result = await aclMatrix<IAclMatrixResult>(
                            {
                                table: step.dataTable ?? [],
                                probe: 'party.person.get',
                                target: ACL_TARGET_PERSONS,
                            },
                            $meta,
                        );
                        assert.equal(
                            result.mismatches.length,
                            0,
                            `a table with nothing wrong reports nothing:\n${result.render()}`,
                        );
                        assert.equal(result.ok, true, 'and the matrix is green');
                    },
            },
            {name, group},
        ),
}));
