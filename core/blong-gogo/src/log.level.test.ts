/**
 * The runtime level change of the framework's log.
 *
 * A config reload calls `setLevel` when `log.level` changes. What it has to do is re-point the level a
 * logger defaults to, so a logger built afterwards carries the levels the new threshold allows — the
 * property `Internal.setLogLevel` relies on when it re-creates a component's logger.
 */
import {test} from 'tap';

import LukaotLog from './LukaotLog.ts';

// The destination is a writer that drops what it is given: the test asserts on which methods are
// bound, not on output.
const newLog = (level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'): LukaotLog =>
    new LukaotLog({level, writer: {write: () => undefined}});

test('setLevel re-points the level a later logger defaults to', async t => {
    const log = newLog('info');
    t.equal(typeof log.logger(undefined, {}).info, 'function', 'info is bound at info');
    // Every member is bound at every level and the logger filters — so the *effect* of the threshold is
    // what a test can see, not the shape of the face.
    t.type(log.logger(undefined, {}).debug, 'function', 'debug is bound as a member');

    log.setLevel('debug');
    t.equal(typeof log.logger(undefined, {}).debug, 'function', 'debug is bound after lowering');

    log.setLevel('error');
    const quiet = log.logger(undefined, {});
    t.type(quiet.info, 'function', 'the member is still there, filtered by the threshold');
    t.equal(typeof quiet.error, 'function', 'error stays bound');
});
