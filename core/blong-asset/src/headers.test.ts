import {test} from 'tap';
import {collectInlineHashes, contentSecurityPolicy, securityHeaders} from './headers.ts';

/**
 * The header set, asserted as data rather than through a response.
 *
 * A browser is the only thing that enforces a CSP, so what a test can do is pin the policy the
 * server promises: the strict default, the removal a caller asks for, and the hash an inline block
 * gets — which is the one value that has to be computed rather than configured.
 */
test('the default policy names the build and nothing else', async t => {
    const policy = contentSecurityPolicy(undefined, {isHttps: false});
    t.match(policy, /default-src 'self'/, 'scripts and fetches default to the same origin');
    t.match(
        policy,
        /script-src 'self' 'unsafe-eval'/,
        'the template engine compiles with new Function, so eval is the framework’s default',
    );
    t.notMatch(policy, /unsafe-inline'[^;]*script-src/, 'while scripts are not inline');
    t.match(policy, /frame-ancestors 'none'/, 'the page may not be framed');
    t.match(policy, /object-src 'none'/, 'no plugins');
    t.match(policy, /form-action 'self'/, 'a form cannot post elsewhere');
    t.notMatch(policy, /upgrade-insecure-requests/, 'plain HTTP is not upgraded');
    t.match(
        contentSecurityPolicy(undefined, {isHttps: true}),
        /upgrade-insecure-requests/,
        'and a TLS response is',
    );
    t.end();
});

test('an inline block contributes its own hash', async t => {
    const html =
        '<html><head><style>body{color:red}</style></head>' +
        '<body><script>window.__boot = 1</script>' +
        '<script src="/s/app.js"></script></body></html>';
    const hashes = collectInlineHashes(html);
    t.equal(hashes.scriptHashes.length, 1, 'the inline script is hashed');
    t.equal(hashes.styleHashes.length, 1, 'the inline style is hashed');
    t.match(hashes.scriptHashes[0], /^'sha256-[A-Za-z0-9+/=]+'$/, 'in the form a policy takes');
    const policy = contentSecurityPolicy(undefined, {
        isHttps: false,
        inlineScriptHashes: hashes.scriptHashes,
        inlineStyleHashes: hashes.styleHashes,
    });
    t.match(policy, /script-src 'self' 'unsafe-eval' 'sha256-/, 'the script hash rides script-src');
    t.match(policy, /style-src 'self' 'unsafe-inline' 'sha256-/, 'the style hash rides style-src');
    t.end();
});

test('a caller can add, override and remove a directive', async t => {
    const policy = contentSecurityPolicy(
        {
            scriptHashes: ["'sha256-abc='"],
            directives: {
                'connect-src': ["'self'", 'https://api.example.test'],
                'frame-ancestors': [],
                'script-src': ["'self'", "'sha256-abc='"],
            },
        },
        {isHttps: false},
    );
    t.match(policy, /script-src 'self' 'sha256-abc='/, 'a configured hash is whitelisted');
    t.notMatch(policy, /unsafe-eval/, 'and eval can be dropped by a bundle that needs none');
    t.match(policy, /connect-src 'self' https:\/\/api\.example\.test/, 'a directive is replaced');
    t.notMatch(policy, /frame-ancestors/, 'an empty list removes the default');
    t.equal(
        contentSecurityPolicy({disabled: true}, {isHttps: true}),
        undefined,
        'and the whole policy can be turned off',
    );
    t.end();
});

test('the document policies stay off a subresource', async t => {
    const asset = securityHeaders(undefined, {isHtml: false, isHttps: true});
    // What a browser reads from a script or a stylesheet: what it is and who may embed it.
    t.equal(asset['x-content-type-options'], 'nosniff', 'a subresource is not sniffed');
    t.equal(asset['cross-origin-resource-policy'], 'same-origin', 'and says who may embed it');
    t.match(
        asset['strict-transport-security'],
        /max-age=/,
        'HSTS is a host policy on every answer',
    );
    // And what it ignores, because the document it belongs to already decided it.
    for (const name of [
        'content-security-policy',
        'x-frame-options',
        'referrer-policy',
        'permissions-policy',
        'cross-origin-opener-policy',
        'x-dns-prefetch-control',
        'x-permitted-cross-domain-policies',
    ]) {
        t.notOk(asset[name], `${name} rides only on the document`);
    }

    const document = securityHeaders(undefined, {isHtml: true, isHttps: true});
    t.match(
        document['content-security-policy'],
        /default-src 'self'/,
        'the shell still gets its policy',
    );
    t.equal(document['x-frame-options'], 'DENY');
    t.end();
});

test('the headers are the strict set, and overrides win', async t => {
    const headers = securityHeaders(undefined, {isHtml: true, isHttps: true});
    t.equal(headers['x-content-type-options'], 'nosniff');
    t.equal(headers['x-frame-options'], 'DENY');
    t.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
    t.match(headers['permissions-policy'], /camera=\(\)/);
    t.match(headers['strict-transport-security'], /max-age=31536000/);
    t.notOk(headers['access-control-allow-origin'], 'no cross-origin reader by default');

    const overridden = securityHeaders(
        {
            headers: {'x-frame-options': 'SAMEORIGIN'},
            hsts: false,
            corsOrigins: ['https://app.example.test'],
        },
        {isHtml: true, isHttps: true, origin: 'https://app.example.test'},
    );
    t.equal(overridden['x-frame-options'], 'SAMEORIGIN', 'an override is the last word');
    t.notOk(overridden['strict-transport-security'], 'HSTS can be turned off');
    t.equal(
        overridden['access-control-allow-origin'],
        'https://app.example.test',
        'a named origin is echoed',
    );

    const refused = securityHeaders(
        {corsOrigins: ['https://app.example.test']},
        {isHtml: false, isHttps: false, origin: 'https://evil.example.test'},
    );
    t.notOk(refused['access-control-allow-origin'], 'an unlisted origin is not allowed');
    t.notOk(
        securityHeaders(undefined, {isHtml: false, isHttps: false})['strict-transport-security'],
        'HSTS is only sent over TLS',
    );
    t.end();
});
