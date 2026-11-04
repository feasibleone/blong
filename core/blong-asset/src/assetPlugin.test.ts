import type {FastifyInstance} from 'fastify';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {test, type Test} from 'tap';
import {createAssetServer} from './assetPlugin.ts';

/**
 * The server's promises, through the HTTP surface a browser uses.
 *
 * The bundle here is the shape a build emits: a shell naming a hashed file, an unhashed file, a
 * precompressed sibling, and a directory a client-side route only exists in. What is asserted is
 * what a deployment depends on — the redirect, the shell for a navigation, the compression, the
 * cache each file gets, and the refusal of the one URL that would leave the directory.
 */
const fixture = (): {dir: string; close: () => void} => {
    const dir = mkdtempSync(join(tmpdir(), 'blong-asset-'));
    writeFileSync(
        join(dir, 'index.html'),
        '<!doctype html><title>ui</title><script>window.__boot = 1</script>' +
            '<script type="module" src="/s/assets/app-12345678.js"></script>',
    );
    mkdirSync(join(dir, 'assets'), {recursive: true});
    writeFileSync(join(dir, 'assets', 'app-12345678.js'), 'console.log("app")');
    writeFileSync(join(dir, 'assets', 'plain.js'), 'console.log("plain")');
    writeFileSync(join(dir, 'assets', 'app-12345678.js.gz'), gzipSync('console.log("app")'));
    writeFileSync(join(dir, 'robots.txt'), 'User-agent: *\nAllow: /\n');
    return {dir, close: () => rmSync(dir, {recursive: true, force: true})};
};

const withServer = async (
    t: Test,
    options: Partial<Parameters<typeof createAssetServer>[0]> = {},
): Promise<{
    dir: string;
    server: FastifyInstance;
    inject: (
        url: string,
        headers?: Record<string, string>,
    ) => Promise<{statusCode: number; headers: Record<string, unknown>; body: string}>;
}> => {
    const fixtureOnDisk = fixture();
    const server = await createAssetServer({root: fixtureOnDisk.dir, ...options});
    t.teardown(async () => {
        await server.close();
        fixtureOnDisk.close();
    });
    return {
        dir: fixtureOnDisk.dir,
        server,
        inject: (url, headers) => server.inject({method: 'GET', url, headers}),
    };
};

test('the root redirects to the bundle and the prefix is one address', async t => {
    const {inject} = await withServer(t);
    const root = await inject('/');
    t.equal(root.statusCode, 308, 'the root is a redirect');
    t.equal(root.headers.location, '/s/', 'to the prefix the build uses');

    const bare = await inject('/s');
    t.equal(bare.statusCode, 308, 'the prefix without its slash is a redirect too');
    t.equal(bare.headers.location, '/s/');

    const shell = await inject('/s/');
    t.equal(shell.statusCode, 200, 'the shell is served at the prefix');
    t.match(shell.body, /<title>ui<\/title>/);
    t.match(
        shell.headers['content-security-policy'],
        /script-src 'self' 'unsafe-eval' 'sha256-/,
        'and its inline boot script is whitelisted by hash rather than by unsafe-inline',
    );
    t.equal(shell.headers['cache-control'], 'no-cache', 'the shell is revalidated every visit');
    t.equal(shell.headers['x-content-type-options'], 'nosniff');
    t.equal(shell.headers['x-frame-options'], 'DENY');
    t.end();
});

test('a hashed file is immutable and an unhashed one is not', async t => {
    const {inject} = await withServer(t);
    const hashed = await inject('/s/assets/app-12345678.js');
    t.equal(hashed.statusCode, 200);
    t.equal(
        hashed.headers['cache-control'],
        'public, max-age=31536000, immutable',
        'a name that carries its hash is cached for a year',
    );
    t.match(hashed.headers['content-type'], /javascript/);
    t.equal(
        hashed.headers['x-content-type-options'],
        'nosniff',
        'the resource keeps its own guard',
    );
    t.notOk(
        hashed.headers['content-security-policy'],
        'and does not carry the document policies a browser would ignore here',
    );
    t.notOk(hashed.headers['x-frame-options'], 'a script cannot be framed');
    t.notOk(hashed.headers['referrer-policy'], 'and has no referrers of its own');

    const plain = await inject('/s/assets/plain.js');
    t.equal(plain.statusCode, 200);
    t.equal(
        plain.headers['cache-control'],
        'public, max-age=3600',
        'a plain name is not immutable',
    );
    t.end();
});

test('the compressed sibling is preferred when the client accepts it', async t => {
    const {inject} = await withServer(t);
    const compressed = await inject('/s/assets/app-12345678.js', {'accept-encoding': 'gzip'});
    t.equal(compressed.statusCode, 200);
    t.equal(compressed.headers['content-encoding'], 'gzip', 'the .gz sibling is what was sent');
    t.match(compressed.headers.vary, /accept-encoding/, 'and a cache is told why');

    const plain = await inject('/s/assets/app-12345678.js');
    t.notOk(plain.headers['content-encoding'], 'a client that accepts none gets the file itself');
    t.equal(plain.body, 'console.log("app")');
    t.end();
});

test('a client-side route gets the shell, a missing file does not', async t => {
    const {inject} = await withServer(t);
    const route = await inject('/s/coral/42', {accept: 'text/html'});
    t.equal(route.statusCode, 200, 'a navigation is the shell');
    t.match(route.body, /<title>ui<\/title>/);

    const missing = await inject('/s/assets/missing.js', {accept: 'text/html'});
    t.equal(missing.statusCode, 404, 'a missing module is not papered over with HTML');
    t.equal(missing.headers['x-content-type-options'], 'nosniff', 'the miss is still not sniffed');
    t.equal(
        missing.headers['cross-origin-resource-policy'],
        'same-origin',
        'and still says who may embed it',
    );
    t.notOk(missing.headers['content-security-policy'], 'while the document policies stay off it');
    t.end();
});

test('a path that leaves the bundle is refused', async t => {
    const {dir, inject} = await withServer(t);
    writeFileSync(join(dir, '..', 'blong-asset-secret.txt'), 'secret');
    try {
        for (const url of ['/s/../blong-asset-secret.txt', '/s/%2e%2e/blong-asset-secret.txt']) {
            const answer = await inject(url);
            t.equal(answer.statusCode, 404, `${url} is refused`);
            t.notMatch(answer.body, /secret/, 'and the file behind it is not leaked');
        }
    } finally {
        rmSync(join(dir, '..', 'blong-asset-secret.txt'), {force: true});
    }
    t.end();
});

test('the process answers for its own health and for the files it carries', async t => {
    const {inject} = await withServer(t);
    t.equal((await inject('/healthz')).statusCode, 200, 'liveness does not read the bundle');
    t.equal((await inject('/readyz')).statusCode, 200, 'readiness does once the root exists');

    const robots = await inject('/robots.txt');
    t.equal(robots.statusCode, 200, 'the bundle’s own robots.txt wins');
    t.match(robots.body, /Allow: \//);

    const favicon = await inject('/favicon.ico');
    t.equal(favicon.statusCode, 200, 'a favicon the bundle does not have is the package’s own');
    t.end();
});

test('a root that is not there yet serves nothing and is not ready', async t => {
    const server = await createAssetServer({root: join(tmpdir(), 'blong-asset-absent-xyz')});
    t.teardown(() => server.close());
    const ready = await server.inject({method: 'GET', url: '/readyz'});
    t.equal(ready.statusCode, 503, 'a volume that is still being filled is not ready');
    const shell = await server.inject({method: 'GET', url: '/s/'});
    t.equal(shell.statusCode, 404, 'and nothing is served');
    t.equal((await server.inject({method: 'GET', url: '/healthz'})).statusCode, 200);
    t.end();
});

test('cors is silent unless an origin is allowed, and HEAD is answered', async t => {
    const {inject, server} = await withServer(t, {
        headers: {corsOrigins: ['https://app.example.test']},
    });
    const allowed = await inject('/s/assets/plain.js', {origin: 'https://app.example.test'});
    t.equal(
        allowed.headers['access-control-allow-origin'],
        'https://app.example.test',
        'a listed origin may read the bundle',
    );
    const refused = await inject('/s/assets/plain.js', {origin: 'https://evil.example.test'});
    t.notOk(refused.headers['access-control-allow-origin'], 'an unlisted one may not');

    const head = await server.inject({method: 'HEAD', url: '/s/assets/app-12345678.js'});
    t.equal(head.statusCode, 200, 'HEAD is the same route as GET');
    t.equal(head.body, '', 'with no body');
    t.end();
});

test('the policy a caller configures is the policy a response carries', async t => {
    const {inject} = await withServer(t, {
        headers: {
            csp: {directives: {'connect-src': ["'self'", 'https://api.example.test']}},
            headers: {'x-frame-options': 'SAMEORIGIN'},
        },
    });
    const answer = await inject('/s/');
    t.match(
        answer.headers['content-security-policy'],
        /connect-src 'self' https:\/\/api\.example\.test/,
    );
    t.equal(answer.headers['x-frame-options'], 'SAMEORIGIN', 'a suite can relax what it must');
    t.end();
});

test('a bundle at another prefix answers there', async t => {
    const {inject} = await withServer(t, {base: '/ui'});
    const root = await inject('/');
    t.equal(root.headers.location, '/ui/', 'the root redirects to the configured prefix');
    t.equal((await inject('/ui')).headers.location, '/ui/', 'and the bare prefix does too');
    const shell = await inject('/ui/');
    t.equal(shell.statusCode, 200, 'the shell is served under it');
    t.match(shell.headers['content-security-policy'], /default-src 'self'/);
    t.end();
});

test('each convenience can be turned off', async t => {
    const noRedirect = await withServer(t, {redirectRoot: false});
    t.equal(
        (await noRedirect.inject('/')).statusCode,
        404,
        'no redirect means no answer at the root',
    );

    const noFallback = await withServer(t, {spaFallback: false});
    t.equal(
        (await noFallback.inject('/s/deep/route', {accept: 'text/html'})).statusCode,
        404,
        'no fallback means a client-side route is a miss',
    );

    const noBuiltIns = await withServer(t, {builtIns: false});
    t.equal(
        (await noBuiltIns.inject('/favicon.ico')).statusCode,
        404,
        'no built-ins means the package serves only the bundle',
    );

    const noPolicy = await withServer(t, {headers: {csp: {disabled: true}}});
    t.notOk(
        (await noPolicy.inject('/s/')).headers['content-security-policy'],
        'and the policy itself can be off, for a bundle no policy can describe',
    );
    t.end();
});
