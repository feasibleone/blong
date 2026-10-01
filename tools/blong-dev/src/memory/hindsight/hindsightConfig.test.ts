/**
 * Unit tests for the Hindsight configuration (`hindsightConfig.ts`).
 *
 * The index is optional, so the two things worth pinning are the precedence order
 * and the off switch: a wrong answer here either stops indexing silently or points
 * the CLI at somebody else's server.
 */

import {test} from 'tap';

import {
    DEFAULT_HINDSIGHT_BANK,
    DEFAULT_HINDSIGHT_URL,
    resolveHindsightConfig,
} from './hindsightConfig.ts';

test('falls back to the local server and the repository bank', async t => {
    const config = resolveHindsightConfig({}, undefined);
    t.equal(config.enabled, true, 'on unless told otherwise');
    t.equal(config.url, DEFAULT_HINDSIGHT_URL, 'default url');
    t.equal(config.bank, DEFAULT_HINDSIGHT_BANK, 'default bank');
    t.end();
});

test('the environment wins over .blong_devrc, the file over the default', async t => {
    const rc = {hindsight: {url: 'http://from-file:8888', bank: 'from-file'}};

    const fromFile = resolveHindsightConfig({}, rc);
    t.equal(fromFile.url, 'http://from-file:8888', 'file beats default');
    t.equal(fromFile.bank, 'from-file', 'bank from file');

    const fromEnv = resolveHindsightConfig(
        {HINDSIGHT_API_URL: 'http://from-env:8888', HINDSIGHT_BANK: 'from-env'},
        rc,
    );
    t.equal(fromEnv.url, 'http://from-env:8888', 'environment beats file');
    t.equal(fromEnv.bank, 'from-env', 'bank from environment');
    t.end();
});

test('a trailing slash is trimmed, so joining paths cannot double it', async t => {
    const config = resolveHindsightConfig({HINDSIGHT_API_URL: 'http://host:8888//'}, undefined);
    t.equal(config.url, 'http://host:8888');
    t.end();
});

test('the off switch is explicit and reads the usual spellings', async t => {
    const off = (value: string) =>
        resolveHindsightConfig({HINDSIGHT_DISABLED: value}, undefined).enabled;

    t.equal(off('1'), false, '1 disables');
    t.equal(off('TRUE'), false, 'case does not matter');
    t.equal(off('on'), false, 'on disables');
    t.equal(off('0'), true, '0 leaves it on');
    t.equal(off('false'), true, 'false leaves it on');
    t.equal(off('off'), true, 'off leaves it on, since it is the switch that is off');
    t.equal(off(''), true, 'unset leaves it on');
    t.end();
});

test('an empty URL disables the index instead of pointing it at nothing', async t => {
    const config = resolveHindsightConfig({HINDSIGHT_API_URL: '   '}, undefined);
    t.equal(config.enabled, false);
    t.end();
});
