import t from 'tap';
import {compactStack} from './stack.ts';

t.test('compaction keeps the error type and the first two frames', t => {
    const stack = [
        'Error: connection timeout',
        '    at Socket.handleTimeout (/app/src/net/pool.ts:42:12)',
        '    at process.processTimers (node:internal/timers:512:11)',
        '    at listOnTimeout (node:internal/timers:569:17)',
        '    at Timer.processTimers (node:internal/timers:607:10)',
    ].join('\n');
    const compact = compactStack(stack);
    t.equal(
        compact,
        'Error Socket.handleTimeout (/app/src/net/pool.ts) -> process.processTimers (node:internal/timers)',
    );
    t.end();
});

t.test('line and column numbers never affect the result', t => {
    const a = compactStack('Error: x\n    at f (/app/a.ts:1:2)\n    at g (/app/b.ts:3:4)');
    const b = compactStack('Error: x\n    at f (/app/a.ts:999:88)\n    at g (/app/b.ts:7:9)');
    t.equal(a, b, 'PRD R2 acceptance');
    t.end();
});

t.test('a missing or header-only stack is safe', t => {
    t.equal(compactStack(''), '');
    t.equal(compactStack('Error: only a header'), 'Error');
    t.end();
});

t.test('a line that is not a call site is dropped from the identity', t => {
    // `at async Promise.all (index 0)` carries no file:line:column, so it is not
    // a frame; the real frame before it must survive instead.
    const compact = compactStack('Error: x\n    at f (/app/a.ts:1:2)\n    at async Promise.all (index 0)');
    t.equal(compact, 'Error f (/app/a.ts)');
    t.end();
});

t.test('an empty first line falls back to the generic Error header', t => {
    const compact = compactStack('\n    at f (/app/a.ts:1:2)');
    t.equal(compact, 'Error f (/app/a.ts)');
    t.end();
});
