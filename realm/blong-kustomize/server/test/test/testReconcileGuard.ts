import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

import {collectManifests, isSelfGrant, sweptResourceTypes} from '../../../apply.ts';
import {resolveHelp} from '../../../bin/help.ts';
import {detectSuite, init} from '../../../bin/provision.ts';
import type {KustomizeTree} from '../../../generator.ts';
import {
    crListingScope,
    draftHold,
    prunableByObsolescence,
} from '../../../orchestrator/controller/kustomizeReconcileRun.ts';

/** One manifest as the tree holds it, with the two keys a tree needs to be recognised. */
const object = (kind: string, name: string, namespace?: string): Record<string, unknown> => ({
    apiVersion: kind === 'Deployment' || kind === 'DaemonSet' ? 'apps/v1' : 'v1',
    kind,
    metadata: {name, ...(namespace ? {namespace} : {})},
});

/**
 * server/test/test/testReconcileGuard.ts — what a reconcile pass refuses; a registry pass with no
 * suite entry would deploy the realm's own bare ports (@@F-406).
 */
export default handler(({lib: {group}, handler: {kustomizeReconcileRun}}) => ({
    testReconcileGuard: ({name = 'reconcile guard'}: {name?: string} = {}) =>
        group(name)([
            async function aRegistryPassNeedsASuiteEntry(assert: IAssert, {$meta}: {$meta: IMeta}) {
                const answer = (await kustomizeReconcileRun(
                    // Everything the run that deployed the realm's own ports gave the pass: a
                    // namespace to write into and permission to write. The refusal has to come from
                    // the missing suite rather than from a missing instruction.
                    {namespace: 'someone-else-suite', apply: true},
                    $meta,
                )) as {reconciled: number; applied: boolean; reason?: string};

                assert.equal(
                    answer.applied,
                    false,
                    'a process with no suite entry applies nothing',
                );
                assert.equal(answer.reconciled, 0, 'and reconciles no object');
                assert.match(
                    String(answer.reason),
                    /declares no suite entry/,
                    'while saying which declaration is missing, rather than deploying quietly (T-260)',
                );
            },
            async function readsTheCrsItCanSeeWhenNobodyNamesOne(assert: IAssert) {
                // The page's Reconcile button is this caller: it sends `from: 'cr'` and no namespace,
                // because a deployment page lists a suite it did not have to name. An operator is
                // configured with one namespace and installed for suites in others, so the pass has
                // to read the CRs it can see rather than the namespace it happens to know .
                assert.deepEqual(
                    crListingScope({configured: 'blong-system', held: 0}),
                    {scope: 'any namespace', namespaced: false},
                    'a caller that named no namespace and found nothing reads the whole cluster',
                );
                assert.deepEqual(
                    crListingScope({named: 'blong-suite', configured: 'blong-system', held: 0}),
                    {scope: 'blong-suite', namespaced: true},
                    'a namespace that was named is answered about that namespace, never widened',
                );
                assert.deepEqual(
                    crListingScope({configured: 'blong-system', held: 1}),
                    {scope: 'blong-system', namespaced: true},
                    'and the CR the configured namespace holds is found without asking the cluster',
                );
            },
            async function aDraftDeclarationIsHeldUntilItsRelease(assert: IAssert) {
                // The order a tenant moves a deployment over in: the CR has to exist before the
                // release that patches it can, and a pass over a CR whose artifact is not published
                // yet writes a tree, an Ingress and a fill Job for a suite that cannot start — the
                // first attempt fetched its artifact from a release that did not exist and answered
                // 404 on every pass @@D-1019. `draft: true` is the declaration saying so, and the
                // hold is the whole answer: nothing is planned, so nothing can be half-applied.
                assert.match(
                    String(draftHold({draft: true})),
                    /waiting for the first release/,
                    'a draft is held, and the reason names what it waits for',
                );
                assert.equal(draftHold({}), undefined, 'a CR that says nothing converges');
                assert.equal(
                    draftHold({draft: false}),
                    undefined,
                    'and so does one that was promoted by its release',
                );
                assert.equal(
                    draftHold(undefined),
                    undefined,
                    'a registry pass has no declaration to hold',
                );
            },
            async function identityIsAppliedBeforeTheWorkloadsThatRunUnderIt(assert: IAssert) {
                // The ordering a deployment lost: the fill and migration Jobs were created and their
                // pods refused with `serviceaccount "blong" not found`, because the ServiceAccount
                // their pods name was left to an install nobody ran. Identity is applied first, and
                // the pass does it rather than a runbook @@D-1020.
                const tree: KustomizeTree = new Map([
                    ['deployments/marine.yaml', object('Deployment', 'marine', 'shop')],
                    ['deployer/migrate.yaml', object('Job', 'migrate', 'shop')],
                    ['rbac/jobs-rolebinding.yaml', object('RoleBinding', 'blong', 'shop')],
                    ['rbac/jobs-role.yaml', object('Role', 'blong', 'shop')],
                    ['rbac/service-account.yaml', object('ServiceAccount', 'blong', 'shop')],
                ]);
                const {managed, skipped} = collectManifests(tree);
                assert.deepEqual(
                    managed.map(entry => entry.kind),
                    ['ServiceAccount', 'Role', 'RoleBinding', 'Job', 'Deployment'],
                    'the suite’s identity comes first, then the steps and the processes',
                );
                assert.equal(skipped.length, 0, 'and none of it is left to an install');
            },
            async function aPassNeverWritesItsOwnGrants(assert: IAssert) {
                // The operator holds the verbs for `roles` and `rolebindings` so it can grant the
                // suite its own; the one object those verbs could be used to grow is the object that
                // names the operator, and it is refused by name. A guard stated in RBAC is not
                // available — Kubernetes cannot say "every namespace but mine" @@D-1020.
                const tree: KustomizeTree = new Map([
                    ['grants/blong-operator-role.yaml', object('Role', 'blong-operator', 'shop')],
                    [
                        'grants/blong-operator-rolebinding.yaml',
                        object('RoleBinding', 'blong-operator', 'shop'),
                    ],
                    ['grants/auth-review.yaml', object('ClusterRole', 'auth-review')],
                    ['rbac/service-account.yaml', object('ServiceAccount', 'blong', 'shop')],
                ]);
                const {managed, skipped} = collectManifests(tree);
                assert.deepEqual(
                    managed.map(entry => entry.path),
                    ['rbac/service-account.yaml'],
                    'the suite’s identity is applied and the operator’s own is not',
                );
                assert.match(
                    String(
                        skipped.find(entry => entry.path.includes('blong-operator-role.yaml'))
                            ?.reason,
                    ),
                    /widen its own rights/,
                    'and the skip says which grant it refused and why',
                );
                assert.ok(
                    isSelfGrant(object('Role', 'anything', 'blong-system')),
                    'an identity object in the operator’s own namespace is refused whatever it is called',
                );
                assert.equal(
                    isSelfGrant(object('Deployment', 'blong-operator', 'shop')),
                    false,
                    'while a workload that happens to carry the name is the suite’s to run',
                );
                // Pruning reads the same guard: these objects wear the suite’s labels, so a sweep that
                // compared them against the tree would find them obsolete and delete the Role the pass
                // is running under.
                const selfGrant = {
                    ...object('Role', 'blong-operator', 'shop'),
                } as never;
                assert.deepEqual(
                    prunableByObsolescence([selfGrant]),
                    [],
                    'and a sweep may never remove one',
                );
            },
            async function theCliAnswersHelpOneLevelAtATime(assert: IAssert) {
                // A coding agent explores a CLI the way a person does, one level at a time, and it has
                // no checkout to read a README from when it runs the package with `npx`. The three
                // levels are therefore part of the contract: the commands, one command's verbs, and
                // one verb's parameters (D-1022).
                const index = resolveHelp([]);
                for (const command of ['init', 'provision', 'secret', 'release-notify']) {
                    assert.match(
                        index,
                        new RegExp(`blong-kustomize ${command}`),
                        `${command} is listed`,
                    );
                }
                const provision = resolveHelp(['provision']);
                // The three steps are `init`, edit the rc, `provision`; the verbs are what a reader
                // wants on their own (D-1027).
                for (const verb of ['seal', 'apply', 'restore', 'verify']) {
                    assert.match(provision, new RegExp(verb), `provision lists ${verb}`);
                }
                // The old pairing is gone, and the verb list is what says so: a line that begins with
                // one of them would be a verb, and neither is one any more.
                for (const gone of ['tenant', 'declare']) {
                    assert.equal(
                        new RegExp(`^\\s+${gone}\\s`, 'm').test(provision),
                        false,
                        `provision no longer has a '${gone}' verb: one call does it all`,
                    );
                }
                assert.equal(
                    provision === index,
                    false,
                    'a command answers more than the index does',
                );
                const verb = resolveHelp(['provision', 'restore']);
                assert.match(verb, /--dump=FILE/, 'a verb names its own parameters');
                assert.match(verb, /optional, once/, 'and says why it is optional');
                assert.equal(
                    verb === provision,
                    false,
                    'and a verb answers more than its command does',
                );
                // A word nobody knows falls back to the nearest level that exists, so a typo in a verb
                // still teaches what the command holds rather than printing nothing.
                assert.match(
                    resolveHelp(['provision', 'nope']),
                    /blong-kustomize provision/,
                    'unknown verb',
                );
                assert.equal(resolveHelp(['nope']), index, 'and an unknown command is the index');
            },
            async function anEmptyFolderIsStillProvisionable(assert: IAssert) {
                // What `npx` sees: a working directory that is nobody's package. The answer is a
                // generic context named after the folder, because a tenant that installed the CLI
                // that way has no tree to be found in, and refusing would make the CLI useless where
                // it is most needed (D-1022).
                const empty = detectSuite('/tmp/not-a-suite-anywhere');
                assert.equal(empty.package, false, 'no package is claimed');
                assert.equal(
                    empty.namespace,
                    'not-a-suite-anywhere',
                    'the folder names the tenant',
                );
                assert.equal(empty.tree, undefined, 'and no tree is invented');
                // A suite is found by the package it sits in, and its namespace comes from the manifest
                // that creates it rather than from the package name.
                const suite = detectSuite(process.cwd());
                assert.equal(suite.package, true, 'the realm knows its own package');
                assert.equal(suite.name, 'blong-kustomize', 'from the package name, scope dropped');
                // This realm keeps an *install* tree, not a suite's, so it offers none: what a
                // provision pass needs is `system/kustomize/base`, and a package without one is a
                // package with no tenant to provision.
                assert.equal(suite.tree, undefined, 'and names no tree this realm does not keep');
                assert.equal(
                    suite.namespace,
                    'blong-kustomize',
                    'the namespace falls back to the name',
                );
            },
            async function initWritesTheTenantsFileAndNoSampleOfIt(assert: IAssert) {
                // A file to copy is a step, and the copy is where a value gets forgotten: what a
                // deployment mounts is the file the command writes (D-1024). Everything the command
                // cannot know is empty rather than guessed.
                const dir = mkdtempSync(join(tmpdir(), 'provision-init-'));
                try {
                    init(
                        {root: dir, name: 'shop', namespace: 'shop', package: false},
                        {
                            suite: 'shop',
                            namespace: 'shop',
                            set: [
                                'srv.db.knex.connection.user=blong-shop',
                                'srv.db.knex.connection.password=hunter2',
                            ],
                        },
                    );
                    const rc = readFileSync(
                        join(dir, 'system', 'provision', 'rc', 'blong_releaserc'),
                        'utf8',
                    );
                    // The database is *not* written: a value in this file replaces what the suite
                    // declared, and a folder named after the suite dialled `shop` as a user that
                    // may only reach the database its installation granted — five pods looping
                    // pods and a failed migration in CI (@@F-861).
                    assert.match(
                        rc,
                        /#\s+database: shop/,
                        'the database is offered as a comment, not answered',
                    );
                    assert.doesNotMatch(
                        rc,
                        /^\s+database:/m,
                        'so the suite\u2019s own answer survives the merge',
                    );
                    // The value is added to a document that holds comments, so the writer picks its
                    // own quoting; what matters is the parsed value, and that both `--set`s landed.
                    assert.match(rc, /^\s+user:\s*"?blong-shop"?$/m, 'a value the caller knows');
                    assert.match(
                        rc,
                        /^\s+password:\s*"?hunter2"?$/m,
                        'both, not just the last --set',
                    );
                    assert.equal(
                        existsSync(
                            join(dir, 'system', 'provision', 'rc', 'blong_releaserc.example'),
                        ),
                        false,
                        'and no sample beside it',
                    );
                    // The folder is the tenant's: derived from a deployment, so a clone carries a
                    // stale copy of answers it does not hold (D-1025).
                    assert.equal(
                        readFileSync(join(dir, 'system', 'provision', '.gitignore'), 'utf8').trim(),
                        '*',
                        'the whole folder is ignored, not one file in it',
                    );
                    // The folder is the whole of a tenant's half, the key included: both Secrets are
                    // generators, so one apply is the answer and nothing is written out of band
                    // (D-1029).
                    const kustomization = readFileSync(
                        join(dir, 'system', 'provision', 'kustomization.yaml'),
                        'utf8',
                    );
                    assert.match(kustomization, /name: blong-releaserc-etc/, 'the rc Secret is applied');
                    assert.match(kustomization, /name: blong-master-key/, 'and the master key with it');
                    assert.match(
                        kustomization,
                        /BLONG_MASTER_KEY=\.master_key/,
                        'from the file init wrote, by name',
                    );
                    assert.equal(
                        kustomization.match(/disableNameSuffixHash: true/g)?.length,
                        2,
                        'both names fixed: the workloads read them',
                    );
                    // The file is the value verbatim — a trailing newline would be part of the key.
                    assert.equal(
                        readFileSync(join(dir, 'system', 'provision', '.master_key'), 'utf8').length,
                        64,
                        'the key file is 64 bytes and nothing else',
                    );
                    // A folder with no tree gets a skeleton declaration, and a skeleton has to carry
                    // the volume a release patches into: a JSON-patch `add` needs its parent (D-1028).
                    const declaration = readFileSync(
                        join(dir, 'system', 'provision', 'blongdeployment.yaml'),
                        'utf8',
                    );
                    assert.match(declaration, /draft: true/, 'the declaration is a draft');
                    assert.match(
                        declaration,
                        /suiteVolume:/,
                        'and holds the volume a release writes',
                    );
                    assert.match(
                        readFileSync(
                            join(dir, 'system', 'provision', 'grants', 'blong-operator-role.yaml'),
                            'utf8',
                        ),
                        /serviceaccounts/,
                        "the grants are the operator's own rules, not a copy of them",
                    );
                    // A tenant whose declaration is made elsewhere asks for the folder without one:
                    // a skeleton beside the real declaration is two of them, and the one that
                    // converged first names an artifact nobody published (D-1030).
                    const bare = mkdtempSync(join(tmpdir(), 'provision-bare-'));
                    try {
                        init(
                            {root: bare, name: 'shop', namespace: 'shop', package: false},
                            {noDeclaration: true},
                        );
                        assert.equal(
                            existsSync(join(bare, 'system', 'provision', 'blongdeployment.yaml')),
                            false,
                            'no declaration is written',
                        );
                        const listed = readFileSync(
                            join(bare, 'system', 'provision', 'kustomization.yaml'),
                            'utf8',
                        );
                        assert.equal(listed.includes('blongdeployment'), false, 'and none is listed');
                        // A pass reads more than the namespace the declaration lives in, so the
                        // folder grants more than one: the namespaces its services run in are named
                        // here, because a declaration that would say so is the caller's (T-837).
                        init(
                            {root: bare, name: 'shop', namespace: 'shop', package: false},
                            {noDeclaration: true, servicesNamespace: ['shop-services'], force: true},
                        );
                        const services = join(bare, 'system', 'provision', 'namespaces', 'shop-services');
                        assert.equal(
                            existsSync(join(services, 'namespace.yaml')),
                            true,
                            'the namespace a pass reads is created by the tenant',
                        );
                        assert.match(
                            readFileSync(join(services, 'blong-operator-role.yaml'), 'utf8'),
                            /namespace: shop-services/,
                            'with the operator granted in it, named for itself',
                        );
                        // Outside the kustomization, because its root `namespace:` renames every
                        // namespaced object it composes into the tenant's own (F-440) — the pair
                        // would collide with the tenant's.
                        assert.equal(
                            readFileSync(
                                join(bare, 'system', 'provision', 'kustomization.yaml'),
                                'utf8',
                            ).includes('shop-services'),
                            false,
                            'and none of it is listed by the tenant’s half',
                        );
                    } finally {
                        rmSync(bare, {recursive: true, force: true});
                    }
                    // `--force` rewrites the manifests and leaves the tenant's answers alone: the rc
                    // file is the only copy of what this deployment dials, and taking it back costs
                    // a credential. `--force-rc` is the deliberate form (D-1024).
                    const rcPath = join(dir, 'system', 'provision', 'rc', 'blong_releaserc');
                    writeFileSync(rcPath, 'srv: {}\n');
                    init(
                        {root: dir, name: 'shop', namespace: 'shop', package: false},
                        {force: true},
                    );
                    assert.equal(
                        readFileSync(rcPath, 'utf8'),
                        'srv: {}\n',
                        '--force keeps the rc file',
                    );
                    init(
                        {root: dir, name: 'shop', namespace: 'shop', package: false},
                        {force: true, forceRc: true},
                    );
                    assert.match(
                        readFileSync(rcPath, 'utf8'),
                        /database: shop/,
                        '--force-rc rewrites it',
                    );
                } finally {
                    rmSync(dir, {recursive: true, force: true});
                }
            },
            async function theSweepCoversTheSuitesOwnIdentity(assert: IAssert) {
                // A kind a tree stops naming has to be looked for, or the object it left behind is
                // orphaned by the pass that was supposed to remove it @@T-282. The suite’s
                // identity is one of those kinds now; a cluster-scoped role is not, because it belongs
                // to the install @@D-1020.
                const swept = sweptResourceTypes();
                for (const resourceType of ['service_account', 'role', 'role_binding']) {
                    assert.ok(swept.includes(resourceType), `${resourceType} is swept`);
                }
                for (const resourceType of ['cluster_role', 'cluster_role_binding']) {
                    assert.equal(
                        swept.includes(resourceType),
                        false,
                        `${resourceType} stays the install’s`,
                    );
                }
            },
        ]),
}));
