import t from 'tap';
import {mask} from './normalize.ts';

t.test('variable values are replaced by stable tokens', t => {
    t.equal(
        mask('user 4821 logged in from 10.0.4.12'),
        'user <NUM> logged in from <IP>',
    );
    t.equal(
        mask('job 01H8XYZ5K2M9PQRSTVWXYZ0A1B finished'),
        'job <ULID> finished',
    );
    t.equal(
        mask('resource 550e8400-e29b-41d4-a716-446655440000 missing'),
        'resource <UUID> missing',
    );
    t.end();
});

t.test('timestamps and hex addresses are masked', t => {
    t.equal(mask('timeout after 5000ms at 2026-09-13T10:11:12.345Z'), 'timeout after <NUM>ms at <TS>');
    t.equal(mask('pointer 0xdeadbeef passed'), 'pointer <HEX> passed');
    t.end();
});

t.test('whitespace is collapsed and trimmed', t => {
    t.equal(mask('  a   b  \n  c  '), 'a b c');
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
