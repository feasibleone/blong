/**
 * Unit tests for the shared `blong` / `blong-watch` `--help` handling.
 *
 * The `bin/blong.ts` / `bin/blong-watch.ts` entries are intentionally NOT
 * imported (they have FS side effects and exit the process); the pure helpers
 * in cliHelp.ts are tested here, mirroring the convention used by
 * runServer.test.ts.
 */

import {test} from 'tap';

import {shouldShowHelp, USAGE} from './cliHelp.ts';

test('shouldShowHelp — recognises --help and -h', async t => {
    t.equal(shouldShowHelp({_: [], help: true}), true, '--help');
    t.equal(shouldShowHelp({_: [], h: true}), true, '-h');
    t.equal(shouldShowHelp({_: [], help: false}), false, 'explicit false');
    t.equal(shouldShowHelp({_: []}), false, 'no flags');
    t.equal(shouldShowHelp({_: ['integration']}), false, 'positional intents only');
    t.equal(shouldShowHelp({_: [], debug: true}), false, 'unrelated flag');
    t.end();
});

test('USAGE documents positional intents, realm creation and --help', async t => {
    t.match(USAGE, /--help/, 'mentions --help');
    t.match(USAGE, /intents are positional/, 'explains intent model');
    t.match(USAGE, /microservice \+ integration \+ dev/, 'documents default intents');
    t.match(USAGE, /realm <name>/, 'documents realm creation');
    t.match(USAGE, /integration/, 'lists integration intent');
    t.end();
});
