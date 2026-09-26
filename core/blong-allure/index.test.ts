/**
 * Tests for blong-allure
 */

import type {IStepProgress} from '@feasibleone/blong-chain';
import {mkdir, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'tap';
import {allureSessionStart} from './lifecycle/allureSessionStart.js';
import {allureGroupResultWrite} from './writer/allureGroupResultWrite.js';
import {allureLabelsBuild} from './writer/allureLabelsBuild.js';
import {allureLinksBuild} from './writer/allureLinksBuild.js';
import {allureProgressMap} from './writer/allureProgressMap.js';
import {allureResultWrite} from './writer/allureResultWrite.js';
import {allureStatusMap} from './writer/allureStatusMap.js';
import {allureStepMap} from './writer/allureStepMap.js';
import {allureStepTreeMap} from './writer/allureStepTreeMap.js';

test('allureStatusMap', async t => {
    t.equal(allureStatusMap('completed'), 'passed');
    t.equal(allureStatusMap('failed'), 'failed');
    t.equal(allureStatusMap('pending'), 'skipped');
    t.equal(allureStatusMap('running'), 'skipped');
    t.equal(allureStatusMap('unknown'), 'unknown');
});

test('allureLabelsBuild', async t => {
    const labels = allureLabelsBuild({
        realm: 'test-realm',
        collection: 'test-collection',
        group: 'test-group',
    });

    t.ok(labels.find(l => l.name === 'framework' && l.value === 'blong'));
    t.ok(labels.find(l => l.name === 'language' && l.value === 'typescript'));
    t.ok(labels.find(l => l.name === 'parentSuite' && l.value === 'test-realm'));
    t.ok(labels.find(l => l.name === 'suite' && l.value === 'test-collection'));
    t.ok(labels.find(l => l.name === 'subSuite' && l.value === 'test-group'));
});

test('allureLinksBuild', async t => {
    const links = allureLinksBuild({traceId: 'abc123'} as any, {
        logUrl: 'http://log.example/trace/{traceId}',
    });

    t.equal(links.length, 1);
    t.equal(links[0].type, 'trace');
    t.equal(links[0].name, 'Trace');
    t.equal(links[0].url, 'http://log.example/trace/abc123');
});

test('allureLinksBuild without traceId', async t => {
    const links = allureLinksBuild(undefined, {logUrl: 'http://log.example/trace/{traceId}'});

    t.equal(links.length, 0);
});

test('allureStepMap - maps steps', async t => {
    const steps: IStepProgress[] = [
        {
            stepName: 'parent-step',
            displayName: 'parent-step',
            groupPath: [],
            status: 'completed',
            startTime: 1000,
            endTime: 2000,
            dependencies: [],
            dependents: [],
        },
        {
            stepName: 'child-step',
            displayName: 'child-step',
            groupPath: ['parent-group'],
            status: 'completed',
            startTime: 1100,
            endTime: 1900,
            dependencies: [],
            dependents: [],
        },
    ];

    const mapped = allureStepMap(steps);

    t.ok(mapped);
    if (!mapped) return;
    t.equal(mapped.length, 2);
    t.equal(mapped[0].name, 'parent-step');
    t.equal(mapped[0].status, 'passed');
    t.equal(mapped[1].name, 'child-step');
});

test('allureStepMap - includes error details', async t => {
    const steps: IStepProgress[] = [
        {
            stepName: 'failing-step',
            displayName: 'failing-step',
            groupPath: [],
            status: 'failed',
            startTime: 1000,
            endTime: 1100,
            dependencies: [],
            dependents: [],
            error: {
                message: 'Test error',
                stack: 'Error: Test error\n  at test.ts:10',
                context: {},
            },
        },
    ];

    const mapped = allureStepMap(steps);

    t.ok(mapped);
    if (!mapped) return;
    t.equal(mapped[0].status, 'failed');
    t.ok(mapped[0].statusDetails);
    t.equal(mapped[0].statusDetails?.message, 'Test error');
    t.ok(mapped[0].statusDetails?.trace?.includes('test.ts:10'));
});

test('allureProgressMap - a point is a step and a branch the group of its own', async t => {
    const mark = {
        discriminator: 'discount-tier',
        candidates: ['none', 'standard'],
        chosen: 'standard',
    };
    const steps = allureProgressMap([
        {kind: 'point', name: 'total-calculated', timestamp: 1},
        {kind: 'region', ...mark, values: {total: 200}},
        {kind: 'point', name: 'discount-applied', timestamp: 2, regions: [mark]},
    ]);

    t.ok(steps);
    if (!steps) return;
    t.equal(steps.length, 2, 'the point before the branch stands beside it, not inside it');
    t.equal(steps[0].name, 'total-calculated');
    t.equal(steps[0].status, 'passed', 'a moment has no verdict of its own');
    t.equal(steps[0].steps, undefined, 'and holds nothing');
    t.equal(steps[1].name, 'discount-tier = standard', 'the branch is named by what it chose');
    t.equal(steps[1].steps?.length, 1);
    t.equal(steps[1].steps?.[0].name, 'discount-applied', 'with the point taken in it under it');
});

test('allureProgressMap - nothing announced is no steps at all', async t => {
    t.equal(allureProgressMap(undefined), undefined);
    t.equal(allureProgressMap([]), undefined);
});

test('allureResultWrite - writes the announced progress as nested steps', async t => {
    const tempDir = join(tmpdir(), 'allure-progress-' + Date.now());
    await mkdir(tempDir, {recursive: true});

    const mark = {discriminator: 'discount-tier', candidates: ['standard'], chosen: 'standard'};
    const step: IStepProgress = {
        stepName: 'order',
        displayName: 'order',
        groupPath: [],
        status: 'completed',
        startTime: Date.now(),
        endTime: Date.now() + 1000,
        dependencies: [],
        dependents: [],
        progress: [
            {kind: 'region', ...mark, values: {}},
            {kind: 'point', name: 'discount-applied', timestamp: 1, regions: [mark]},
        ],
    };

    await allureResultWrite(tempDir, step, {realm: 'test-realm'});

    const files = (await readdir(tempDir)).filter(f => f.endsWith('-result.json'));
    t.equal(files.length, 1);
    const written = JSON.parse(await readFile(join(tempDir, files[0]), 'utf-8'));
    t.equal(written.steps?.length, 1, 'the branch is the one step the report nests');
    t.equal(written.steps?.[0].name, 'discount-tier = standard');
    t.equal(written.steps?.[0].steps?.[0].name, 'discount-applied');

    await rm(tempDir, {recursive: true, force: true});
});

test('allureResultWrite - creates result file', async t => {
    const tempDir = join(tmpdir(), 'allure-test-' + Date.now());
    await mkdir(tempDir, {recursive: true});

    const step: IStepProgress = {
        stepName: 'test-step',
        displayName: 'test-step',
        groupPath: [],
        status: 'completed',
        startTime: Date.now(),
        endTime: Date.now() + 1000,
        dependencies: [],
        dependents: [],
    };

    await allureResultWrite(
        tempDir,
        step,
        {
            realm: 'test-realm',
            collection: 'test-collection',
            logUrl: 'http://localhost:9998/trace/{traceId}',
        },
        {traceId: 'test-trace-123'} as any,
    );

    // Verify file was created
    const files = await readdir(tempDir);
    t.equal(files.filter(f => f.endsWith('-result.json')).length, 1);
    t.equal(
        JSON.parse(await readFile(join(tempDir, files[0]), 'utf-8')).steps,
        undefined,
        'a step that announced nothing writes no steps, which is the shape it had before',
    );

    await rm(tempDir, {recursive: true, force: true});
    t.pass('Result file created successfully');
});

test('allureSessionStart - creates metadata files', async t => {
    const tempDir = join(tmpdir(), 'allure-session-' + Date.now());

    await allureSessionStart({
        outputDir: tempDir,
    });

    // Check environment.properties exists
    const envPath = join(tempDir, 'environment.properties');
    const envContent = await readFile(envPath, 'utf-8');
    t.ok(envContent.includes('framework=blong'));
    t.ok(envContent.includes('language=typescript'));

    // Check executor.json exists
    const execPath = join(tempDir, 'executor.json');
    const execContent = await readFile(execPath, 'utf-8');
    const executor = JSON.parse(execContent);
    t.equal(executor.type, 'github');

    await rm(tempDir, {recursive: true, force: true});
});

/** A step fixture: everything is defaulted except what the test is about. */
function stepFixture(over: Partial<IStepProgress> & {stepName: string}): IStepProgress {
    return {
        displayName: over.stepName,
        groupPath: [],
        status: 'completed',
        startTime: 1,
        endTime: 2,
        dependencies: [],
        dependents: [],
        ...over,
    } as IStepProgress;
}

test('allureStepTreeMap - nests steps by their group path and keeps their points', async t => {
    const mark = {discriminator: 'discount-tier', candidates: ['standard'], chosen: 'standard'};
    const tree = allureStepTreeMap([
        stepFixture({
            stepName: 'createOrder',
            progress: [
                {kind: 'point', name: 'total-calculated', timestamp: 1},
                {kind: 'region', ...mark, values: {}},
                {kind: 'point', name: 'discount-applied', timestamp: 2, regions: [mark]},
            ],
        }),
        stepFixture({stepName: 'pay', groupPath: ['createOrder']}),
    ]);

    t.equal(tree?.length, 1, 'the nested step is not also a top-level step');
    t.equal(tree?.[0].name, 'createOrder');
    t.same(
        tree?.[0].steps?.map(child => child.name),
        ['total-calculated', 'discount-tier = standard', 'pay'],
        'the points the step announced come first, then the step it nested',
    );
    t.equal(tree?.[0].steps?.[1].steps?.[0].name, 'discount-applied');
});

test('allureStepTreeMap - keeps an orphan step rather than dropping it', async t => {
    const tree = allureStepTreeMap([
        stepFixture({stepName: 'orphan', groupPath: ['a', 'parent', 'that', 'never', 'ran']}),
    ]);

    t.equal(tree?.length, 1, 'a step whose parent was not reported is not lost');
    t.equal(tree?.[0].name, 'orphan');
});

test('allureGroupResultWrite - one result per group, with the steps nested inside', async t => {
    const tempDir = join(tmpdir(), 'allure-group-' + Date.now());
    await mkdir(tempDir, {recursive: true});

    await allureGroupResultWrite(
        tempDir,
        {
            name: 'order checkpoint',
            steps: [
                stepFixture({stepName: 'createOrder', startTime: 10, endTime: 30}),
                stepFixture({stepName: 'confirmOrder', startTime: 40, endTime: 60}),
            ],
        },
        {realm: 'test', collection: 'order', group: 'checkpoint'},
    );

    const files = (await readdir(tempDir)).filter(f => f.endsWith('-result.json'));
    t.equal(files.length, 1, 'a group is one result file');
    const written = JSON.parse(await readFile(join(tempDir, files[0]), 'utf-8'));
    t.equal(written.name, 'order checkpoint');
    t.equal(written.fullName, 'test.order.checkpoint.order checkpoint');
    t.equal(written.status, 'passed');
    t.equal(written.start, 10, 'the span covers the group own steps, not the wall clock');
    t.equal(written.stop, 60);
    t.same(
        written.steps?.map((child: {name: string}) => child.name),
        ['createOrder', 'confirmOrder'],
    );

    await rm(tempDir, {recursive: true, force: true});
});

test('allureGroupResultWrite - a failed step fails the group it belongs to', async t => {
    const tempDir = join(tmpdir(), 'allure-group-fail-' + Date.now());
    await mkdir(tempDir, {recursive: true});

    await allureGroupResultWrite(
        tempDir,
        {
            name: 'order checkpoint',
            steps: [
                stepFixture({
                    stepName: 'createOrder',
                    status: 'failed',
                    error: {message: 'boom', stack: 'at createOrder', context: {}},
                }),
            ],
        },
        {realm: 'test'},
    );

    const files = (await readdir(tempDir)).filter(f => f.endsWith('-result.json'));
    const written = JSON.parse(await readFile(join(tempDir, files[0]), 'utf-8'));
    t.equal(written.status, 'failed');
    t.equal(written.statusDetails?.message, 'boom', 'the failure detail names the step error');

    await rm(tempDir, {recursive: true, force: true});
});
