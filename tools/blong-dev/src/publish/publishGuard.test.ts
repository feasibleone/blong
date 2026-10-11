/**
 * The gate over this repository's own publish surfaces.
 *
 * A package that declares entry points and then releases a tarball without them is the failure this
 * repository shipped four times before anyone looked (F-488): `@feasibleone/semantic-log` published three
 * of the five subpaths its `exports` map names, `realm/blong-login` and `core/blong-openapi` published
 * three files of metadata, and `realm/blong-test` published no entry point at all. Nothing inside the
 * repository could see it, because every resolution here goes through the workspace — so the guard has to
 * run where a consumer would: against the files a real `npm pack` would release.
 *
 * It runs `npm pack` once per publishing package, which is why it is slower than its neighbours. What it
 * does not fail on is a declared target this checkout has not built: `dist/` is gitignored build output, and
 * a target that is absent is reported rather than treated as published-and-lost.
 */

import {dirname} from 'node:path';
import {test} from 'tap';

import {auditRepository} from '../commands/publish.ts';
import {findUp} from '../utils/findConfig.ts';

test('no publishing package hides a declared entry point from its tarball', t => {
    const rush = findUp(process.cwd(), 'rush.json');
    t.ok(rush, 'the repository root is above the working directory');
    if (!rush) {
        t.end();
        return;
    }
    const findings = auditRepository(dirname(rush));
    t.ok(findings.length > 0, 'at least one package declares ci-publish, else this check proves nothing');
    for (const finding of findings) {
        t.equal(finding.failure, undefined, `${finding.name} could be packed`);
        t.same(
            finding.unpublished,
            [],
            `${finding.name} publishes every entry point it declares and has`,
        );
        if (finding.unbuilt.length > 0) {
            t.comment(
                `${finding.name}: declared and not built here: ${finding.unbuilt.join(', ')}`,
            );
        }
    }
    // The packages are also listed, so a run that silently checked nothing is visible in the output.
    t.comment(
        `checked ${findings.length} package(s): ${findings.map(finding => finding.dir).join(', ')}`,
    );
    t.end();
});
