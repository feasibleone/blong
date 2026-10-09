import Fastify from 'fastify';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'tap';
import staticPlugin from './static.ts';

/**
 * The two states a deployed suite's browser build can be in (Phase 15 H).
 *
 * A released suite serves its own UI out of the artifact it was deployed from, at the prefix a
 * browser build uses (`/s`, which `core/blong-browser/src/vite.ts` sets as its `base`). The root is a
 * per-suite config value, and a suite may legitimately have no bundle at all — a realm-only suite
 * does — so the two things worth pinning are that a bundle in place is served, and that its absence
 * leaves a working API rather than a process that never came up.
 */
test('a browser build in place is served under /s', async t => {
    const dir = mkdtempSync(join(tmpdir(), 'blong-static-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>ui</title>');
    const server = Fastify();
    try {
        await server.register(staticPlugin, {root: dir});
        await server.ready();
        const answer = await server.inject({method: 'GET', url: '/s/index.html'});
        t.equal(answer.statusCode, 200, 'the bundle answers at the prefix the build uses');
        t.match(answer.body, /<title>ui<\/title>/, 'and it is the file that was there');
    } finally {
        await server.close();
        rmSync(dir, {recursive: true, force: true});
    }
    t.end();
});

test('a suite with no browser build still starts', async t => {
    const parent = mkdtempSync(join(tmpdir(), 'blong-static-none-'));
    const missing = join(parent, 'browser', 'dist');
    mkdirSync(join(parent, 'browser'), {recursive: true});
    const server = Fastify();
    try {
        await server.register(staticPlugin, {root: missing});
        // `ready` is the point of the test: registering a missing root used to be the kind of thing
        // that fails here, and a released process that cannot become ready serves nothing at all.
        await server.ready();
        const answer = await server.inject({method: 'GET', url: '/s/index.html'});
        t.equal(answer.statusCode, 404, 'nothing is served from a root that is not there');
        // What the plugin *did* register is still there, which is the difference between skipping the
        // bundle and skipping the plugin.
        t.ok(
            server.hasRoute({method: 'GET', url: '/favicon.ico'}),
            'while the routes the plugin owns are registered',
        );
    } finally {
        await server.close();
        rmSync(parent, {recursive: true, force: true});
    }
    t.end();
});
