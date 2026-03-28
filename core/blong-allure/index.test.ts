/**
 * Tests for blong-allure
 */

import {test} from 'tap';
import {allureStatusMap} from './writer/allureStatusMap.js';
import {allureLabelsBuild} from './writer/allureLabelsBuild.js';
import {allureLinksBuild} from './writer/allureLinksBuild.js';

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
