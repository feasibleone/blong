/**
 * Unit tests for the runtime level change of the pino implementation.
 *
 * A config reload calls `setLevel` when `log.level` changes. What it has to do is
 * re-point the level a logger defaults to, so a logger built afterwards carries
 * the levels the new threshold allows — the property `Internal.setLogLevel`
 * relies on when it re-creates a component's logger.
 */
import {test} from 'tap';

import Log from './Log.ts';

// The destination is a file rather than a worker-backed transport, so the test
// spawns nothing: it asserts on which methods are bound, not on output.
const newLog = (level: string): Log =>
    new Log({level, transport: {target: 'pino/file', options: {destination: '/dev/null'}}});

test('setLevel re-points the level a later logger defaults to', async t => {
    const log = newLog('info');
    t.equal(typeof log.logger(undefined, {}).info, 'function', 'info is bound at info');
    t.equal(log.logger(undefined, {}).debug, undefined, 'debug is above the threshold');

    log.setLevel('debug');
    t.equal(typeof log.logger(undefined, {}).debug, 'function', 'debug is bound after lowering');

    log.setLevel('error');
    const quiet = log.logger(undefined, {});
    t.equal(quiet.info, undefined, 'info is above the raised threshold');
    t.equal(typeof quiet.error, 'function', 'error stays bound');
});
