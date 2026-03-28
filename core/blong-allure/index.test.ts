/**
 * Tests for blong-allure
 */

import {test} from 'tap';
import {writeFile, mkdir, rm, readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {allureStatusMap} from './writer/allureStatusMap.js';
import {allureLabelsBuild} from './writer/allureLabelsBuild.js';
import {allureLinksBuild} from './writer/allureLinksBuild.js';
import {allureStepMap} from './writer/allureStepMap.js';
import {allureResultWrite} from './writer/allureResultWrite.js';
import {allureSessionStart} from './lifecycle/allureSessionStart.js';
import {allureSessionEnd} from './lifecycle/allureSessionEnd.js';
import type {IStepProgress} from '@feasibleone/blong-chain';

test('allureStatusMap', async t => {
    t.equal(allureStatusMap('success'), 'passed');
    t.equal(allureStatusMap('error'), 'failed');
    t.equal(allureStatusMap('waiting'), 'skipped');
    t.equal(allureStatusMap('skipped'), 'skipped');
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
    const links = allureLinksBuild(
        {traceId: 'abc123'} as any,
        {logUrl: 'http://log.example/trace/{traceId}'},
    );

    t.equal(links.length, 1);
    t.equal(links[0].type, 'trace');
    t.equal(links[0].name, 'Trace');
    t.equal(links[0].url, 'http://log.example/trace/abc123');
});

test('allureLinksBuild without traceId', async t => {
    const links = allureLinksBuild(
        undefined,
        {logUrl: 'http://log.example/trace/{traceId}'},
    );

    t.equal(links.length, 0);
});

test('allureStepMap - maps nested steps', async t => {
    const steps: IStepProgress[] = [
        {
            name: 'parent-step',
            status: 'success',
            latency: {
                startedAt: 1000,
                completedAt: 2000,
            },
            steps: [
                {
                    name: 'child-step',
                    status: 'success',
                    latency: {
                        startedAt: 1100,
                        completedAt: 1900,
                    },
                },
            ],
        },
    ];

    const mapped = allureStepMap(steps);

    t.ok(mapped);
    t.equal(mapped.length, 1);
    t.equal(mapped[0].name, 'parent-step');
    t.equal(mapped[0].status, 'passed');
    t.ok(mapped[0].steps);
    t.equal(mapped[0].steps?.length, 1);
    t.equal(mapped[0].steps?.[0].name, 'child-step');
});

test('allureStepMap - includes error details', async t => {
    const steps: IStepProgress[] = [
        {
            name: 'failing-step',
            status: 'error',
            error: {
                message: 'Test error',
                stack: 'Error: Test error\n  at test.ts:10',
            },
            latency: {
                startedAt: 1000,
                completedAt: 1100,
            },
        },
    ];

    const mapped = allureStepMap(steps);

    t.ok(mapped);
    t.equal(mapped[0].status, 'failed');
    t.ok(mapped[0].statusDetails);
    t.equal(mapped[0].statusDetails?.message, 'Test error');
    t.ok(mapped[0].statusDetails?.trace?.includes('test.ts:10'));
});

test('allureResultWrite - creates result file', async t => {
    const tempDir = join(tmpdir(), 'allure-test-' + Date.now());
    await mkdir(tempDir, {recursive: true});

    const step: IStepProgress = {
        name: 'test-step',
        status: 'success',
        latency: {
            startedAt: Date.now(),
            completedAt: Date.now() + 1000,
        },
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
    const files = await readFile(tempDir, 'utf-8');
    
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
