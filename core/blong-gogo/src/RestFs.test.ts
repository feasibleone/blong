/**
 * Tests for RestFs component — path traversal, CRUD, and edge cases via Fastify injection.
 */

import assert from 'node:assert';
import {mkdir, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {after, before, describe, it} from 'node:test';

import fastify, {type FastifyInstance} from 'fastify';
import fp from 'fastify-plugin';
import RestFs from './RestFs.ts';

/**
 * Helper: create an isolated RestFs + Fastify instance for testing.
 * Returns { server, baseDir, cleanup }.
 */
async function setup(options?: {shell?: boolean}): Promise<{
    server: FastifyInstance;
    baseDir: string;
    cleanup: () => Promise<void>;
}> {
    const baseDir = join(tmpdir(), `restfs-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(baseDir, {recursive: true});

    // RestFs expects a gateway with registerPlugin — we accumulate the plugin and register it ourselves
    let capturedPlugin: unknown;
    let capturedOptions: unknown;
    const fakeGateway = {
        registerPlugin(plugin: unknown, opts?: unknown) {
            capturedPlugin = plugin;
            capturedOptions = opts;
        },
    };

    const restFs = new (RestFs as any)(
        {enabled: true, baseDir, routePrefix: '/api/fs', maxFileSize: 52428800, auth: false, shell: options?.shell ?? false},
        {gateway: fakeGateway},
    );
    await restFs.init();

    const server = fastify();
    // Stub auth config so routes don't require it
    server.addHook('preValidation', (_req, _reply, done) => done());
    if (capturedPlugin) await server.register(capturedPlugin as any, capturedOptions as any);
    await server.ready();

    return {
        server,
        baseDir,
        cleanup: async () => {
            await server.close();
            await rm(baseDir, {recursive: true, force: true});
        },
    };
}

describe('RestFs', () => {
    let server: FastifyInstance;
    let baseDir: string;
    let cleanup: () => Promise<void>;

    before(async () => {
        ({server, baseDir, cleanup} = await setup());
    });

    after(async () => {
        await cleanup();
    });

    // ---- CRUD ----

    describe('CRUD operations', () => {
        it('GET /stat/* — returns 404 for non-existent path', async () => {
            const res = await server.inject({method: 'GET', url: '/api/fs/stat/does-not-exist'});
            assert.strictEqual(res.statusCode, 404);
        });

        it('POST /mkdir/* — creates a directory', async () => {
            const res = await server.inject({method: 'POST', url: '/api/fs/mkdir/test-dir'});
            assert.strictEqual(res.statusCode, 200);
            assert.deepStrictEqual(res.json(), {success: true});
        });

        it('GET /stat/* — returns metadata for existing directory', async () => {
            const res = await server.inject({method: 'GET', url: '/api/fs/stat/test-dir'});
            assert.strictEqual(res.statusCode, 200);
            const body = res.json();
            assert.strictEqual(body.type, 'directory');
            assert.ok(typeof body.mtime === 'number');
        });

        it('POST /write/* — writes a file', async () => {
            const content = Buffer.from('hello world');
            const res = await server.inject({
                method: 'POST',
                url: '/api/fs/write/test-dir/file.txt',
                headers: {'content-type': 'application/octet-stream'},
                payload: content,
            });
            assert.strictEqual(res.statusCode, 200);
            assert.deepStrictEqual(res.json(), {success: true});

            // Verify the file on disk
            const written = await readFile(join(baseDir, 'test-dir', 'file.txt'));
            assert.deepStrictEqual(written, content);
        });

        it('POST /write/* — returns 415 for non-binary body', async () => {
            const res = await server.inject({
                method: 'POST',
                url: '/api/fs/write/test-dir/bad.txt',
                headers: {'content-type': 'application/json'},
                payload: JSON.stringify({text: 'oops'}),
            });
            assert.strictEqual(res.statusCode, 415);
            assert.ok(res.json().error.includes('octet-stream'));
        });

        it('GET /read/* — reads file contents back', async () => {
            const res = await server.inject({method: 'GET', url: '/api/fs/read/test-dir/file.txt'});
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body, 'hello world');
        });

        it('GET /read/* — returns 404 for non-existent file', async () => {
            const res = await server.inject({method: 'GET', url: '/api/fs/read/nope.txt'});
            assert.strictEqual(res.statusCode, 404);
        });

        it('GET /readdir/* — lists directory entries', async () => {
            const res = await server.inject({method: 'GET', url: '/api/fs/readdir/test-dir'});
            assert.strictEqual(res.statusCode, 200);
            const entries = res.json();
            assert.ok(Array.isArray(entries));
            assert.ok(entries.some((e: {name: string}) => e.name === 'file.txt'));
        });

        it('POST /rename — renames a file', async () => {
            const res = await server.inject({
                method: 'POST',
                url: '/api/fs/rename',
                payload: {oldPath: 'test-dir/file.txt', newPath: 'test-dir/renamed.txt'},
            });
            assert.strictEqual(res.statusCode, 200);
            assert.deepStrictEqual(res.json(), {success: true});
        });

        it('POST /copy — copies a file', async () => {
            const res = await server.inject({
                method: 'POST',
                url: '/api/fs/copy',
                payload: {source: 'test-dir/renamed.txt', destination: 'test-dir/copied.txt'},
            });
            assert.strictEqual(res.statusCode, 200);
            assert.deepStrictEqual(res.json(), {success: true});

            const content = await readFile(join(baseDir, 'test-dir', 'copied.txt'), 'utf-8');
            assert.strictEqual(content, 'hello world');
        });

        it('DELETE /delete/* — deletes a file', async () => {
            const res = await server.inject({method: 'DELETE', url: '/api/fs/delete/test-dir/copied.txt'});
            assert.strictEqual(res.statusCode, 200);
            assert.deepStrictEqual(res.json(), {success: true});
        });

        it('DELETE /delete/* — returns 404 for non-existent path', async () => {
            const res = await server.inject({method: 'DELETE', url: '/api/fs/delete/nope.txt'});
            assert.strictEqual(res.statusCode, 404);
        });

        it('DELETE /delete/* — deletes directory recursively', async () => {
            const res = await server.inject({
                method: 'DELETE',
                url: '/api/fs/delete/test-dir?recursive=true',
            });
            assert.strictEqual(res.statusCode, 200);
        });
    });

    // ---- Path traversal ----

    describe('Path traversal protection', () => {
        // Note: URL-level .. traversal is normalized by Fastify before routing,
        // resulting in 404 (route not matched). This is valid HTTP-level protection.
        // The handler-level resolveSafePath protection is tested via body-based
        // endpoints (rename, copy) below, which bypass URL normalization.

        it('rejects .. traversal in URL (Fastify normalizes → 404)', async () => {
            const res = await server.inject({method: 'GET', url: '/api/fs/stat/../../../etc/passwd'});
            assert.strictEqual(res.statusCode, 404);
        });

        it('rejects .. traversal in readdir URL (Fastify normalizes → 404)', async () => {
            const res = await server.inject({method: 'GET', url: '/api/fs/readdir/../../'});
            assert.strictEqual(res.statusCode, 404);
        });

        it('rejects .. traversal in write URL (Fastify normalizes → 404)', async () => {
            const res = await server.inject({
                method: 'POST',
                url: '/api/fs/write/../escape.txt',
                headers: {'content-type': 'application/octet-stream'},
                payload: Buffer.from('pwned'),
            });
            assert.strictEqual(res.statusCode, 404);
        });

        it('rejects .. traversal in rename (oldPath) — handler-level', async () => {
            const res = await server.inject({
                method: 'POST',
                url: '/api/fs/rename',
                payload: {oldPath: '../../etc/passwd', newPath: 'safe.txt'},
            });
            assert.strictEqual(res.statusCode, 403);
        });

        it('rejects .. traversal in rename (newPath) — handler-level', async () => {
            await writeFile(join(baseDir, 'a.txt'), 'test');
            const res = await server.inject({
                method: 'POST',
                url: '/api/fs/rename',
                payload: {oldPath: 'a.txt', newPath: '../../escape.txt'},
            });
            assert.strictEqual(res.statusCode, 403);
        });

        it('rejects .. traversal in copy (destination) — handler-level', async () => {
            await writeFile(join(baseDir, 'b.txt'), 'test');
            const res = await server.inject({
                method: 'POST',
                url: '/api/fs/copy',
                payload: {source: 'b.txt', destination: '../../escape.txt'},
            });
            assert.strictEqual(res.statusCode, 403);
        });
    });

    // ---- Symlink escape ----

    describe('Symlink escape protection', () => {
        it('rejects symlink pointing outside baseDir', async () => {
            const linkPath = join(baseDir, 'evil-link');
            try {
                await symlink('/tmp', linkPath);
            } catch {
                // symlink creation may fail on some CI — skip
                return;
            }
            const res = await server.inject({method: 'GET', url: '/api/fs/stat/evil-link'});
            assert.strictEqual(res.statusCode, 403);
        });

        it('rejects write through symlinked parent directory', async () => {
            const linkPath = join(baseDir, 'escape-dir');
            try {
                await symlink('/tmp', linkPath);
            } catch {
                return;
            }
            const res = await server.inject({
                method: 'POST',
                url: '/api/fs/write/escape-dir/file.txt',
                headers: {'content-type': 'application/octet-stream'},
                payload: Buffer.from('pwned'),
            });
            assert.strictEqual(res.statusCode, 403);
        });
    });
});

describe('RestFs disabled', () => {
    it('does not register plugin when enabled is false', async () => {
        let registered = false;
        const fakeGateway = {
            registerPlugin() {
                registered = true;
            },
        };
        const restFs = new (RestFs as any)(
            {enabled: false, baseDir: '/tmp', routePrefix: '/api/fs', maxFileSize: 1024, auth: false, shell: false},
            {gateway: fakeGateway},
        );
        await restFs.init();
        assert.strictEqual(registered, false, 'Plugin should not be registered when disabled');
    });

    it('does not register plugin when gateway is missing', async () => {
        const restFs = new (RestFs as any)(
            {enabled: true, baseDir: '/tmp', routePrefix: '/api/fs', maxFileSize: 1024, auth: false, shell: false},
            {},
        );
        // Should not throw
        await restFs.init();
    });
});

describe('RestFs shell endpoint', () => {
    let server: FastifyInstance;
    let baseDir: string;
    let cleanup: () => Promise<void>;

    before(async () => {
        ({server, baseDir, cleanup} = await setup({shell: true}));
    });

    after(async () => {
        await cleanup();
    });

    it('POST /shell — executes a command and streams output', async () => {
        const res = await server.inject({
            method: 'POST',
            url: '/api/fs/shell',
            payload: {command: 'echo hello'},
        });
        // Shell uses raw streaming; inject returns the raw response
        assert.strictEqual(res.statusCode, 200);
        assert.ok(res.body.includes('hello'));
    });

    it('POST /shell — returns 400 when command is missing', async () => {
        const res = await server.inject({
            method: 'POST',
            url: '/api/fs/shell',
            payload: {command: ''},
        });
        assert.strictEqual(res.statusCode, 400);
    });

    it('POST /shell — validates cwd within baseDir', async () => {
        const res = await server.inject({
            method: 'POST',
            url: '/api/fs/shell',
            payload: {command: 'pwd', cwd: '../../'},
        });
        assert.strictEqual(res.statusCode, 400);
    });
});
