import t from 'tap';

import {isTargetArgument, resolveTarget} from './cliTarget.ts';

/**
 * The rule that keeps an intent from being mistaken for a folder.
 *
 * Pinned here rather than in the binaries, which parse `process.argv` at import and cannot be called
 * twice: the failure this guards against is silent at load time and reads as a crash
 * (`ERR_UNSUPPORTED_DIR_IMPORT`) a long way from the argument that caused it.
 */
t.test('a bare word is an intent, even when a folder holds that name', async t => {
    const exists = (path: string) => path === 'dev';
    t.same(resolveTarget(['dev'], exists), {intents: ['dev']}, 'dev is the dev intent');
    t.same(
        resolveTarget(['microservice', 'dev'], exists),
        {intents: ['microservice', 'dev']},
        'and so is every other bare word',
    );
});

t.test('a path is a target', async t => {
    const exists = (path: string) => ['dev/', './dev', 'src/server.ts'].includes(path);
    t.same(resolveTarget(['./dev'], exists), {target: './dev', intents: []}, './dev is the folder');
    t.same(
        resolveTarget(['dev/', 'integration'], exists),
        {target: 'dev/', intents: ['integration']},
        'a trailing separator is enough, and the rest are intents',
    );
    t.same(
        resolveTarget(['src/server.ts', 'dev'], exists),
        {target: 'src/server.ts', intents: ['dev']},
        'a file beside its intents',
    );
});

t.test('a path that is not there is not a target', async t => {
    const exists = () => false;
    t.same(resolveTarget(['./nope'], exists), {intents: ['./nope']}, 'the loader reports it');
    t.same(resolveTarget([], exists), {intents: []}, 'and no positional is no target');
});

t.test('only the first positional is considered', async t => {
    const exists = () => true;
    t.same(
        resolveTarget(['dev', './server.ts'], exists),
        {intents: ['dev', './server.ts']},
        'an intent first means every positional is an intent',
    );
});

t.test('what counts as a path', async t => {
    t.equal(isTargetArgument('dev'), false, 'a bare name is not a path');
    t.equal(isTargetArgument('dev/'), true, 'a trailing separator is');
    t.equal(isTargetArgument('./dev'), true, 'a relative prefix is');
    t.equal(isTargetArgument('../suite'), true, 'a parent is');
    t.equal(isTargetArgument('/opt/deploy/suite'), true, 'an absolute path is');
    t.equal(
        isTargetArgument('.'),
        false,
        'a lone dot is a name by this rule — write `./` for this folder',
    );
    t.equal(isTargetArgument(undefined), false, 'and no positional is not one');
});
