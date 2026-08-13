/**
 * Unit tests for the `progress` capability exposed on framework loggers
 * (`Log.logger()` and `BrowserLog.logger()`). The engine itself (`withProgress`)
 * is covered in `@feasibleone/blong-lib`; these tests only verify the logger
 * wiring — that `logger.progress` is present and delegates correctly.
 */

import {test} from 'tap';

import BrowserLog from './BrowserLog.ts';
import Log from './Log.ts';

test('Log.logger().progress wraps a promise and resolves with the value', async t => {
    const log = new Log({
        level: 'info',
        // Built-in destination transport — no worker thread, silent destination.
        transport: {target: 'pino/file', options: {destination: '/dev/null'}},
    });
    const logger = log.logger('info', {name: 'log.progress.test'});
    t.equal(typeof logger.progress, 'function', 'progress is exposed on the server logger');

    const promise = new Promise<string>(resolve => setTimeout(() => resolve('done'), 30));
    const result = await logger.progress?.('slow op', promise);
    t.equal(result, 'done', 'resolves with the underlying value');
});

test('BrowserLog.logger().progress wraps a promise and resolves with the value', async t => {
    const log = new BrowserLog({level: 'info'});
    const logger = log.logger('info', {name: 'log.progress.test'});
    t.equal(typeof logger.progress, 'function', 'progress is exposed on the browser logger');

    const promise = new Promise<string>(resolve => setTimeout(() => resolve('done'), 30));
    const result = await logger.progress?.('slow op', promise);
    t.equal(result, 'done', 'resolves with the underlying value');
});
