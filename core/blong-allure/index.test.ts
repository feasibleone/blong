/**
 * Tests for blong-allure
 */

import type {IStepProgress} from '@feasibleone/blong-chain';
import {mkdir, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'tap';
import {allureSessionStart} from './lifecycle/allureSessionStart.js';
import {allureLabelsBuild} from './writer/allureLabelsBuild.js';
import {allureLinksBuild} from './writer/allureLinksBuild.js';
import {allureResultWrite} from './writer/allureResultWrite.js';
import {allureStatusMap} from './writer/allureStatusMap.js';
import {allureStepMap} from './writer/allureStepMap.js';

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
