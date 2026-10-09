import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'tap';

/**
 * The release rc pair (Phase 15 E, Q7) needs no code of its own, and this file is the proof.
 *
 * `rc` appends `rc` to the name it is given, so the framework's existing `rc('blong_' + suffix)` —
 * where `suffix` is the **trailing** intent — already resolves to `/etc/blong_releaserc` and
 * `$HOME/.blong_releaserc`, the two paths the suite's tree mounts from optional Secrets. What the
 * pair needs is that the intent list arrives intact, so that a released process really has `release`
 * last instead of the default `dev`; that wiring is `ConfigRuntime`'s, which is why the last test
 * here drives the load from it. The tempting alternative — a third call with the name
 * `blong_releaser` — resolves to `blong_releaserrc` and reads nothing, which is the mistake the
 * assertions below are shaped to catch.
 *
 * This is a file of its own because of how `rc` reads `$HOME`: it captures the value when it is
 * imported (`var home = process.env.HOME` at module scope), so putting a temporary home in front of
 * it means setting `HOME` *before* the first import that reaches `rc`. That is why the two modules
 * under test are imported dynamically below, and why the static imports here are `node:*` and `tap`
 * alone — importing `ConfigRuntime` at the top would pull `rc` in first and fix the home to the real
 * one. The probe key is one no other source sets, because the repository's own `.blong_devrc` files
 * are read by the same call.
 */
const dir = mkdtempSync(join(tmpdir(), 'blong-releaser-'));
const home = join(dir, 'home');
mkdirSync(home);
const probeFile = (name: string, value: number) =>
    writeFileSync(join(home, name), JSON.stringify({releasercProbe: {value}}));
// The path the tree mounts, and — under a name a hand-written source would have chosen — a file
// nothing should read. The two carry different values, so one assertion tells them apart.
probeFile('.blong_releaserc', 42);
probeFile('.blong_releaserrc', 7);
process.env.HOME = home;
process.on('exit', () => rmSync(dir, {recursive: true, force: true}));

const {default: load} = await import('@feasibleone/blong-config');
const {default: ConfigRuntime} = await import('./ConfigRuntime.ts');

const probe = (config: object): number | undefined =>
    (config as {releasercProbe?: {value?: number}}).releasercProbe?.value;

test('a run whose trailing intent is release reads the pair the tree mounts', async t => {
    t.equal(
        probe(load({env: 'microservice,integration,release', config: {suite: 'test-suite'}})),
        42,
        'and it is the mounted path that answered, not the file named after a made-up app',
    );
    t.end();
});

test('a run that is not a release reads the dev file instead', async t => {
    t.equal(
        probe(load({env: 'microservice,integration,dev', config: {suite: 'test-suite'}})),
        undefined,
        'nothing supplies the key, because this home has no .blong_devrc',
    );
    t.end();
});

test('only the trailing intent names the file', async t => {
    // The framework's existing rule, stated where it is load-bearing: a `release` that is not last
    // contributes no suffix, so a deployment that passes it first reads the pair of whatever comes
    // after it. That is the property section K has to respect when it builds the release command.
    t.equal(
        probe(load({env: 'release,dev', config: {suite: 'test-suite'}})),
        undefined,
        'release first is not the suffix',
    );
    t.end();
});

test('the intents reach blong-config through ConfigRuntime', async t => {
    // The pairing a real process depends on: `blong-config` reads the intents out of `env`, and
    // `ConfigRuntime` is what passes them. Without that wiring every process would read the `dev`
    // file whatever it was asked to be, however well the name mapping works.
    const release = await new ConfigRuntime(
        {name: 'test', configNames: ['microservice', 'integration', 'release']},
        [],
        'test-suite',
    ).load();
    t.equal(probe(release), 42, 'a runtime told release reads the pair');

    const dev = await new ConfigRuntime(
        {name: 'test', configNames: ['microservice', 'integration', 'dev']},
        [],
        'test-suite',
    ).load();
    t.equal(probe(dev), undefined, 'and one told dev does not');
    t.end();
});
