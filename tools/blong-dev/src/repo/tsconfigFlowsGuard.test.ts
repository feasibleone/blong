/**
 * The gate over a package's typecheck: every tap flow it ships is compiled by its `tsconfig`.
 *
 * The rule, and the hole it closes, live in `tsconfigFlows.ts` — a package that enumerated its
 * folders instead of globbing them left every flow under `server/test/test/` untyped, and the
 * editor was the only thing that saw it (`@@T-695`).
 */

import {dirname, join} from 'node:path';

import {test} from 'tap';

import {findUp} from '../utils/findConfig.ts';
import {compiledSources, sourcesOf, uncompiledFlows} from './tsconfigFlows.ts';

/** The repository root, from the working directory, or `undefined` outside a checkout. */
function repositoryRoot(): string | undefined {
    const rush = findUp(process.cwd(), 'rush.json');
    return rush === undefined ? undefined : dirname(rush);
}

test('a package compiles the tap flows it holds', async t => {
    const root = repositoryRoot();
    if (root === undefined) {
        t.pass('not inside the repository — nothing to check');
        return;
    }
    const findings = uncompiledFlows(root);
    t.same(
        findings,
        [],
        `${findings.length} flow(s) outside their package's tsconfig` +
            (findings.length ? `: ${findings.slice(0, 12).join(', ')}` : ''),
    );
});

test('the tsconfig is read as TypeScript reads it', async t => {
    const root = repositoryRoot();
    if (root === undefined) {
        t.pass('not inside the repository — nothing to read');
        return;
    }
    // The package whose list forgot `server/` is the one to ask: if this stops answering `true`,
    // the guard above is checking nothing.
    const flows = join(root, 'realm/blong-party');
    t.ok(
        sourcesOf(join(flows, 'server/test')).length > 0,
        'the walk finds the flows a package holds',
    );
    const compiled = compiledSources(flows);
    t.ok(
        compiled.includes('server/test/test/testProfileCreate.ts'),
        'and the package compiles them — the folder its old include list skipped',
    );
});
