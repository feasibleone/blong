import {mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, expect, it} from 'vitest';

import {defineBlongConfig} from './config.js';

/**
 * Where a realm's test directory is resolved from.
 *
 * The base is the whole question. An isolated (pnpm) install links a package
 * only beside its dependents, so a realm a suite *declares* is resolvable from
 * the suite and not from `blong-browser` — which does not depend on the realms a
 * suite hands it, that is what `realmPackages` is for. Asking from here answered
 * "no" for a realm the suite declares, the realm's project was skipped, and the
 * suite's own project stayed unnamed (it is named `suite` only when a realm
 * project resolved): because Playwright appends a named project to every snapshot
 * file name, the same baselines were written as `portal-merged-linux.png` locally
 * and read as `portal-merged-suite-linux.png` in CI (F-208).
 *
 * The fixture below is a suite whose package.json declares a realm package the
 * module under test cannot reach, because nothing about this package's own
 * dependencies changed when a *suite* gained one.
 */
const fixture = (() => {
    const suite = mkdtempSync(join(tmpdir(), 'blong-config-suite-'));
    const realm = mkdtempSync(join(tmpdir(), 'blong-config-realm-'));
    writeFileSync(join(realm, 'package.json'), JSON.stringify({name: '@fixture/realm'}));
    mkdirSync(join(realm, 'test'), {recursive: true});
    writeFileSync(join(suite, 'package.json'), JSON.stringify({name: 'blong-config-fixture'}));
    mkdirSync(join(suite, 'node_modules', '@fixture'), {recursive: true});
    symlinkSync(realm, join(suite, 'node_modules', '@fixture', 'realm'), 'dir');
    return {suite, realm};
})();

afterAll(() => {
    rmSync(fixture.suite, {recursive: true, force: true});
    rmSync(fixture.realm, {recursive: true, force: true});
});

it('resolves a realm test dir from the suite, and names its own project', () => {
    const cwd = process.cwd();
    process.chdir(fixture.suite);
    try {
        const config = defineBlongConfig({realmPackages: ['@fixture/realm']});
        expect(config.projects?.map(project => project.name)).toEqual(['suite', 'realm']);
        expect(config.projects?.[1]?.testDir).toBe(join(fixture.realm, 'test'));
    } finally {
        process.chdir(cwd);
    }
});

it('builds no projects for a realm the suite does not declare', () => {
    const cwd = process.cwd();
    process.chdir(fixture.suite);
    try {
        // `blong-browser` itself does not declare it either, so a resolution base
        // taken from this module finds nothing — which is what the bug looked like.
        expect(defineBlongConfig({realmPackages: ['@fixture/absent']}).projects).toBeUndefined();
    } finally {
        process.chdir(cwd);
    }
});
