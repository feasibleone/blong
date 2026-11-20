import t from 'tap';
import {mask} from './normalize.ts';

t.test('variable values are replaced by stable tokens', t => {
    t.equal(mask('user 4821 logged in from 10.0.4.12'), 'user <NUM> logged in from <IP>');
    t.equal(mask('job 01H8XYZ5K2M9PQRSTVWXYZ0A1B finished'), 'job <ULID> finished');
    t.equal(
        mask('resource 550e8400-e29b-41d4-a716-446655440000 missing'),
        'resource <UUID> missing',
    );
    t.end();
});

t.test('timestamps and hex addresses are masked', t => {
    t.equal(
        mask('timeout after 5000ms at 2026-09-13T10:11:12.345Z'),
        'timeout after <NUM>ms at <TS>',
    );
    t.equal(mask('pointer 0xdeadbeef passed'), 'pointer <HEX> passed');
    t.end();
});

t.test('a home directory is masked in every OS spelling', t => {
    t.equal(mask('cwd /home/username/work/blong'), 'cwd <HOME>/work/blong');
    t.equal(mask('cwd /Users/username/work/blong'), 'cwd <HOME>/work/blong');
    t.equal(mask('cwd C:\\Users\\username\\work'), 'cwd <HOME>\\work');
    t.equal(mask('cwd c:\\users\\username\\work'), 'cwd <HOME>\\work');
    t.equal(mask('cwd C:/Users/username/work'), 'cwd <HOME>/work');
    t.equal(mask('cache /root/.blong/log-cache'), 'cache <HOME>/.blong/log-cache');
    t.equal(mask('<HOME>/work/blong'), '<HOME>/work/blong', 'masking is idempotent');
    t.end();
});

t.test('a home directory is masked only where it opens a path', t => {
    t.equal(mask('mounted /home'), 'mounted /home');
    t.equal(mask('route /homepage/index'), 'route /homepage/index');
    t.equal(mask('data /srv/users/data'), 'data /srv/users/data');
    t.equal(mask('the /rooter cause'), 'the /rooter cause');
    // The username is masked whole: the digit in it must not become a <NUM>.
    t.equal(mask('cwd /home/john2/proj/42/file'), 'cwd <HOME>/proj/<NUM>/file');
    t.end();
});

t.test('whitespace is collapsed and trimmed', t => {
    t.equal(mask('  a   b  \n  c  '), 'a b c');
    t.end();
});

t.test('a message that is not text is coerced, never thrown out of', t => {
    // The message arrives from a call site, and a pino-shaped consumer logs
    // objects: fastify logs the request itself. A logging call must not be able
    // to throw, so anything without a text form degrades to its string form.
    t.equal(mask({url: '/x'}), '[object Object]');
    t.equal(mask(4821), '<NUM>');
    t.equal(mask(undefined), '');
    t.equal(mask(null), '');
    t.equal(mask(''), '');
    t.equal(mask(false), 'false');
    t.end();
});

t.test('two runs of the same path with different values are byte-identical', t => {
    const a = mask('transfer 1001 to account 2002 failed with 503');
    const b = mask('transfer 9987 to account 3311 failed with 500');
    t.equal(a, b, 'PRD R1 acceptance');
    t.end();
});

t.test('empty input is safe', t => {
    t.equal(mask(''), '');
    t.end();
});
