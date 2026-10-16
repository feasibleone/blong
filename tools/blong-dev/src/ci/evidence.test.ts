/**
 * Tests for reading reasons out of an unpacked `reports` artifact.
 *
 * The fixture is the Storybook failure of build #622, which is the case the artifact is the only
 * witness to: the leg exited 1, wrote this log, and left the package's report to its tap leg
 * (@@F-539).
 */
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'tap';

import {artifactEvidence, jestFailures, storybookExcerpt} from './evidence.ts';

const STORYBOOK_LOG = [
    'PASS browser: chromium src/client/LogViewer.stories.tsx (21.808 s)',
    '  LogViewer',
    '    FilteredServer',
    '      ✕ smoke-test (3310 ms)',
    '',
    '  ● LogViewer › FilteredServer › smoke-test',
    '',
    '    Expected image to match or be a close match to snapshot but was 0.5270182291666666% different from snapshot (4857 differing pixels).',
    '    See diff for details: /home/runner/work/blong/blong/tools/blong-log/src/client/__image_snapshots__/__diff_output__/logviewer--filtered-server-diff.png',
    '',
    '    > 163 |             expect(screenshot).toMatchImageSnapshot({',
    '          |                 ^',
    '    at postVisit (tools/blong-log/.storybook/test-runner.cjs:163:32)',
    '',
    ' › 1 snapshot failed.',
    'Snapshot Summary',
    ' › 1 snapshot failed from 1 test suite.',
].join('\n');

test('a jest failure block is quoted from its marker to the next one', t => {
    const excerpt = storybookExcerpt(STORYBOOK_LOG, 'smoke-test');

    t.match(
        excerpt,
        /^  ● LogViewer › FilteredServer › smoke-test$/m,
        'the marker starts the quote',
    );
    t.match(excerpt, /0\.5270182291666666% different from snapshot/, 'the assertion');
    t.match(excerpt, /logviewer--filtered-server-diff\.png/, 'and where the diff is');
    t.notMatch(excerpt, /Snapshot Summary/, 'the summary after it is not part of the block');
    t.end();
});

test('every failing test a jest log names is found once', t => {
    t.same(jestFailures(STORYBOOK_LOG), ['LogViewer › FilteredServer › smoke-test'], 'the marker');
    t.same(jestFailures('  ● a › b\n  ● a › b\n  ● a › c\n'), ['a › b', 'a › c'], 'deduplicated');
    t.same(jestFailures('no marker here'), [], 'nothing to find');
    t.end();
});

test('an artifact answers with what the test process wrote to stderr', t => {
    // The shape of run 618: a suite that died while loading left `test process exited with code 1`
    // in the report and its refusal on stderr, which is the only place it exists (@@F-543).
    const dir = mkdtempSync(join(tmpdir(), 'blong-ci-stderr-'));
    try {
        const reportDir = join(dir, 'realm/blong-access/.ci-report');
        mkdirSync(reportDir, {recursive: true});
        writeFileSync(
            join(reportDir, 'tap-stderr.txt'),
            [
                'loading realm blong-access',
                'Error: Invalid configuration for access:',
                "(root): unknown key 'default' in the config block",
                '',
            ].join('\n'),
        );

        const evidence = artifactEvidence(dir);
        t.match(
            evidence.stderr('realm/blong-access'),
            /unknown key 'default'/,
            'the reason the suite was refused',
        );
        t.notMatch(evidence.stderr('realm/blong-access'), /\n\n/, 'trailing blanks are dropped');
        t.equal(evidence.stderr('realm/blong-party'), undefined, 'a package that captured none');
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
    t.end();
});

test('an artifact answers for a package it has a log for', t => {
    const dir = mkdtempSync(join(tmpdir(), 'blong-ci-evidence-'));
    try {
        const reportDir = join(dir, 'tools/blong-log/.ci-report');
        mkdirSync(reportDir, {recursive: true});
        writeFileSync(join(reportDir, 'storybook.log'), STORYBOOK_LOG);

        const evidence = artifactEvidence(dir);
        t.equal(
            evidence.locate('blong-log'),
            'tools/blong-log',
            'the package is found by its folder',
        );
        t.same(
            evidence.logFailures('tools/blong-log').map(entry => [entry.runner, entry.test]),
            [['storybook', 'LogViewer › FilteredServer › smoke-test']],
            'and its failing leg is named from the log',
        );
        t.equal(evidence.report('tools/blong-log'), undefined, 'a package with no report says so');
        t.equal(evidence.locate('not-a-package'), undefined, 'an unknown package is not invented');
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
    t.end();
});
