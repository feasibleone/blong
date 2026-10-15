/**
 * Unit tests for the packages that report nothing (report/silentProjects.ts).
 *
 * The distinction the collector makes is the one Rush's own output leaves behind: a project whose
 * `ci-test` output is recorded ran and stopped, and a project with no output never ran at all
 * (Rush skips the dependents of a project that failed). Both are absent from the report's counts,
 * which is why they are listed by name @@F-530.
 */

import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {test} from 'tap';

import type {IRushProject} from './aggregate.ts';
import {collectSilentProjects} from './silentProjects.ts';

/** A project folder with a package.json, and the Rush log dir when asked for one. */
function project(
    root: string,
    projectFolder: string,
    options: {ciTest?: string; rushLog?: boolean} = {},
): IRushProject {
    const dir = join(root, projectFolder);
    mkdirSync(dir, {recursive: true});
    writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({
            name: `@feasibleone/${projectFolder.split('/').pop()}`,
            scripts: options.ciTest ? {'ci-test': options.ciTest} : {},
        }),
    );
    if (options.rushLog) {
        const logDir = join(dir, '.rush', 'temp', 'chunked-rush-logs');
        mkdirSync(logDir, {recursive: true});
        writeFileSync(
            join(logDir, `${projectFolder.split('/').pop()}.ci-test.chunks.jsonl`),
            '{"kind":"O","text":"waiting for deployments…"}\n',
        );
    }
    return {
        packageName: `@feasibleone/${projectFolder.split('/').pop()}`,
        projectFolder,
    };
}

test('a project whose command ran and stopped is told apart from one that never ran', async t => {
    const root = mkdtempSync(join(tmpdir(), 'silent-projects-'));
    const projects = [
        project(root, 'test/blong-int-adapter', {
            ciTest: 'wait.sh && blong-dev test',
            rushLog: true,
        }),
        project(root, 'realm/blong-access', {ciTest: 'blong-dev test'}),
        project(root, 'library/match', {ciTest: 'blong-dev test'}),
    ];

    t.same(
        collectSilentProjects(root, projects, []),
        [
            {
                packageName: '@feasibleone/blong-int-adapter',
                projectFolder: 'test/blong-int-adapter',
                state: 'stopped',
            },
            {
                packageName: '@feasibleone/blong-access',
                projectFolder: 'realm/blong-access',
                state: 'never-ran',
            },
            {
                packageName: '@feasibleone/match',
                projectFolder: 'library/match',
                state: 'never-ran',
            },
        ],
        'every project with a ci-test and no report is listed, with what Rush recorded of it',
    );
});

test('a project that reported is not listed, and one without a ci-test is not either', async t => {
    const root = mkdtempSync(join(tmpdir(), 'silent-projects-'));
    const projects = [
        project(root, 'core/blong-gogo', {ciTest: 'blong-dev test'}),
        project(root, 'core/blong-mock', {ciTest: 'blong-dev test'}),
        project(root, 'core/blong', {}),
    ];

    t.same(
        collectSilentProjects(root, projects, ['blong-gogo']),
        [
            {
                packageName: '@feasibleone/blong-mock',
                projectFolder: 'core/blong-mock',
                state: 'never-ran',
            },
        ],
        'the reported package is excluded, and a package with nothing to run is not a silent one',
    );
});

test('a project whose package.json cannot be read is left alone', async t => {
    const root = mkdtempSync(join(tmpdir(), 'silent-projects-'));
    const projects = [
        {packageName: '@feasibleone/gone', projectFolder: 'core/gone'},
        project(root, 'core/present', {ciTest: 'blong-dev test'}),
    ];

    t.same(
        collectSilentProjects(root, projects, []).map(entry => entry.projectFolder),
        ['core/present'],
        'a broken or missing package.json cannot declare a ci-test',
    );
});
