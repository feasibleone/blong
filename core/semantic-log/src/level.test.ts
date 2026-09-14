import t from 'tap';
import {LEVELS, LEVEL_NAMES, enabled, levelName, levelValue} from './level.ts';

t.test('level values match the monorepo convention', t => {
    t.same(LEVELS, {trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60});
    t.same(LEVEL_NAMES, {10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal'});
    t.end();
});

t.test('levelValue accepts a name or a number', t => {
    t.equal(levelValue('info'), 30);
    t.equal(levelValue(50), 50);
    t.end();
});

t.test('enabled compares against an inclusive threshold', t => {
    t.equal(enabled('info', 'debug'), true);
    t.equal(enabled('debug', 'info'), false);
    t.equal(enabled('error', 50), true);
    t.equal(enabled(10, 'trace'), true);
    t.end();
});

t.test('levelName falls back to the raw value for custom levels', t => {
    t.equal(levelName(30), 'info');
    t.equal(levelName(99), '99');
    t.end();
});
