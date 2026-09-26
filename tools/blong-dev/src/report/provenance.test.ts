/**
 * Unit tests for failure provenance (report/provenance.ts).
 *
 * The input is Allure history: one record per run, each holding every test of that run
 * by id. The fixtures below mirror the real records (the shape `demo/blong-marine`
 * writes: `package` tag plus `testResults` keyed by uuid), because the module's whole
 * job is to read that file without a schema of its own.
 */

import {test} from 'tap';

import {indexProvenance, PROVENANCE_RUNS, type FailureProvenance} from './provenance.ts';

interface ITestSpec {
    name: string;
    fullName?: string;
    status: string;
    id?: string;
}

/** One history record: a run of one package holding the given tests. */
function record(pkg: string, run: number, tests: ITestSpec[]): Record<string, unknown> {
    const testResults: Record<string, unknown> = {};
    tests.forEach((spec, index) => {
        testResults[`${pkg}-${run}-${index}`] = {
            // Allure identifies a test by `id` (its historyId), which is what tells two
            // same-named tests of one run apart — the name is not unique on its own.
            id: spec.id ?? `id-${spec.fullName ?? spec.name}`,
            name: spec.name,
            fullName: spec.fullName ?? `spec.play.ts › ${spec.name}`,
            status: spec.status,
        };
    });
    return {package: pkg, testResults, uuid: `${pkg}-${run}`};
}

function kinds(
    index: ReturnType<typeof indexProvenance>,
    pkg: string,
    names: string[],
): Array<FailureProvenance | null> {
    return names.map(name => index.lookup(pkg, name)?.kind ?? null);
}

test('a test that was green in the recent runs is new', t => {
    const index = indexProvenance([
        record('pkg-a', 1, [{name: 'opens the page', status: 'passed'}]),
        record('pkg-a', 2, [{name: 'opens the page', status: 'passed'}]),
        record('pkg-a', 3, [{name: 'opens the page', status: 'passed'}]),
    ]);

    t.same(kinds(index, 'pkg-a', ['opens the page']), ['new'], 'green history reads as new');
    t.same(
        index.lookup('pkg-a', 'opens the page'),
        {kind: 'new', runs: 3, failedRuns: 0},
        'and says how much history it saw',
    );
    t.end();
});

test('a test that failed the last time base ran it is recurring', t => {
    const index = indexProvenance([
        record('pkg-a', 1, [{name: 'renders the tab', status: 'passed'}]),
        record('pkg-a', 2, [{name: 'renders the tab', status: 'failed'}]),
        record('pkg-a', 3, [{name: 'renders the tab', status: 'broken'}]),
    ]);

    t.same(
        index.lookup('pkg-a', 'renders the tab'),
        {kind: 'recurring', runs: 3, failedRuns: 2},
        'main is already red here',
    );
    t.end();
});

test('a test that failed earlier but not last is intermittent', t => {
    const index = indexProvenance([
        record('pkg-a', 1, [{name: 'waits for the socket', status: 'failed'}]),
        record('pkg-a', 2, [{name: 'waits for the socket', status: 'passed'}]),
        record('pkg-a', 3, [{name: 'waits for the socket', status: 'passed'}]),
    ]);

    t.same(
        index.lookup('pkg-a', 'waits for the socket'),
        {kind: 'intermittent', runs: 3, failedRuns: 1},
        'failed once before, green since',
    );
    t.end();
});

test('only the recent window counts, and only the test that was there', t => {
    const records: Array<Record<string, unknown>> = [];
    // Ten runs: the test failed in the first five and has been green since.
    for (let run = 1; run <= 10; run += 1) {
        records.push(
            record('pkg-a', run, [{name: 'reconnects', status: run <= 5 ? 'failed' : 'passed'}]),
        );
    }
    const index = indexProvenance(records);

    t.equal(PROVENANCE_RUNS, 5, 'the window is the last five runs');
    t.same(
        index.lookup('pkg-a', 'reconnects'),
        {kind: 'new', runs: 5, failedRuns: 0},
        'failures older than the window are not held against it',
    );
    t.equal(index.lookup('pkg-a', 'never ran'), null, 'a test the history never saw');
    t.equal(index.lookup('pkg-b', 'reconnects'), null, 'a package with no history');
    t.end();
});

test('a test missing from a run is not counted as having passed it', t => {
    const index = indexProvenance([
        record('pkg-a', 1, [{name: 'depends on the seed', status: 'failed'}]),
        record('pkg-a', 2, [{name: 'something else', status: 'passed'}]),
    ]);

    t.same(
        index.lookup('pkg-a', 'depends on the seed'),
        {kind: 'recurring', runs: 1, failedRuns: 1},
        'one sighting, and it failed',
    );
    t.end();
});

test('a report name matches the path it carries, not just the leaf', t => {
    const index = indexProvenance([
        record('pkg-a', 1, [
            {
                name: 'addGadget',
                fullName: 'e2e.test.ts › e2e flow › addGadget',
                status: 'passed',
            },
        ]),
    ]);

    t.equal(
        index.lookup('pkg-a', 'e2e flow › addGadget')?.kind,
        'new',
        'the tap report names a test by its group path',
    );
    t.equal(index.lookup('pkg-a', 'addGadget')?.kind, 'new', 'and the bare leaf still matches');
    t.end();
});

test('the handler leg’s dotted full name is matched too', t => {
    // `blong-allure` (what the tap leg reports through) writes the full name as
    // `realm.collection.group.step`, which the browser leg's ` › ` does not look like.
    const index = indexProvenance([
        record('pkg-a', 1, [
            {
                name: 'create access role',
                fullName: 'blong-access.Access Role.create access role',
                status: 'passed',
            },
        ]),
    ]);

    t.equal(
        index.lookup('pkg-a', 'Access Role › create access role')?.kind,
        'new',
        'a tap report name is the group path',
    );
    t.equal(index.lookup('pkg-a', 'create access role')?.kind, 'new', 'and so is the leaf');
    t.equal(
        index.lookup('pkg-a', 'Access User › create access user'),
        null,
        'another group is not this test',
    );
    t.end();
});

test('the producer’s own full name wins over the report name', t => {
    // Two browser tests of one package share a title — the model generates one per
    // page — and only the full name the runner recorded tells them apart.
    const index = indexProvenance([
        record('pkg-a', 1, [
            {
                name: 'edit access role',
                fullName: 'model.ts › Access Role › edit access role',
                id: 'form',
                status: 'passed',
            },
            {
                name: 'edit access role',
                fullName: 'model.ts › Access Role · Record Access matrix › edit access role',
                id: 'matrix',
                status: 'failed',
            },
        ]),
    ]);

    t.equal(
        index.lookup('pkg-a', 'edit access role'),
        null,
        'the bare name means nothing when two tests claim it',
    );
    t.same(
        index.lookup('pkg-a', 'edit access role', 'model.ts › Access Role › edit access role'),
        {kind: 'new', runs: 1, failedRuns: 0},
        'the full name resolves the form test',
    );
    t.same(
        index.lookup(
            'pkg-a',
            'edit access role',
            'model.ts › Access Role · Record Access matrix › edit access role',
        ),
        {kind: 'recurring', runs: 1, failedRuns: 1},
        'and the matrix test, which main is red on',
    );
    t.end();
});

test('a name shared by two tests in one run is reported as unknown', t => {
    const index = indexProvenance([
        record('pkg-a', 1, [
            {name: 'adds 1 and 1', fullName: 'one.test.ts › adds 1 and 1', status: 'passed'},
            {name: 'adds 1 and 1', fullName: 'two.test.ts › adds 1 and 1', status: 'failed'},
        ]),
    ]);

    t.equal(index.lookup('pkg-a', 'adds 1 and 1'), null, 'ambiguous names answer nothing');
    t.equal(
        index.lookup('pkg-a', 'one.test.ts › adds 1 and 1')?.kind,
        'new',
        'while the full path is still unique',
    );
    t.end();
});

test('a skipped test is not a failure, and an unknown status is not a pass', t => {
    const index = indexProvenance([
        record('pkg-a', 1, [
            {name: 'needs a browser', status: 'skipped'},
            {name: 'has no status', status: 'unknown'},
        ]),
    ]);

    t.equal(index.lookup('pkg-a', 'needs a browser')?.kind, 'new', 'skipped is not red');
    t.equal(index.lookup('pkg-a', 'has no status')?.kind, 'new', 'neither is unknown');
    t.equal(
        index.lookup('pkg-a', 'has no status')?.failedRuns,
        0,
        'only failed and broken count as red',
    );
    t.end();
});

test('a record without a package tag or usable results is ignored', t => {
    const index = indexProvenance([
        {testResults: {a: {name: 'untagged', status: 'failed'}}},
        {package: 'pkg-a', testResults: 'not an object'},
        record('pkg-a', 1, [{name: 'tagged', status: 'passed'}]),
    ]);

    t.equal(index.lookup('pkg-a', 'untagged'), null, 'an untagged record attributes nothing');
    t.equal(index.lookup('pkg-a', 'tagged')?.kind, 'new', 'and does not disturb the rest');
    t.end();
});
