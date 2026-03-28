/**
 * Tests for blong-ttk
 */

import {test} from 'tap';

test('blong-ttk package loads', async t => {
    const pkg = await import('./package.json', {assert: {type: 'json'}});
    t.equal(pkg.default.name, '@feasibleone/blong-ttk');
});

test('server.ts exports default', async t => {
    const server = await import('./server.js');
    t.ok(server.default);
    t.equal(typeof server.default, 'function');
});
