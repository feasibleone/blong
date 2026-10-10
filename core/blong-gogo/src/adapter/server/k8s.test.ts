import {test} from 'tap';

import {isAbsent, isAlreadyThere, kindOfResource, withItemIdentity, withServerFields} from './k8s.ts';

/**
 * A list answer keeps the identity the API server sends.
 *
 * The generated client's typed serializer drops each item's `apiVersion` and `kind`, so a `find`
 * reached its caller type-blind and every consumer had to know the type from its own request. The
 * cost is on the record: a reconcile diff compared keys it could not build and read eighteen objects
 * as eighteen creations beside eighteen deletions (T-226, T-228). The adapter knows the type from the
 * request it just made, so it says so — and these assertions are that, plus the two places it must
 * *not* say so.
 */

test('kindOfResource spells a compound kind the way the client does', t => {
    t.equal(kindOfResource('deployment'), 'Deployment', 'a one-word kind is capitalised');
    t.equal(
        kindOfResource('persistent_volume_claim'),
        'PersistentVolumeClaim',
        'a compound kind joins the words a method name carries apart',
    );
    t.equal(kindOfResource('token_review'), 'TokenReview', 'however many words there are');
    t.equal(kindOfResource('job'), 'Job', 'and a kind with no separator still reads correctly');
    t.end();
});

test('every listed item comes back knowing what it is', t => {
    const answer = withItemIdentity(
        {
            apiVersion: 'batch/v1',
            kind: 'JobList',
            items: [
                {metadata: {name: 'migrate'}, spec: {}, status: {}},
                {metadata: {name: 'seed'}, spec: {}, status: {}},
            ],
        },
        'job',
    ) as {items: Array<{apiVersion?: string; kind?: string; metadata?: {name?: string}}>};

    t.equal(answer.items.length, 2, 'the list is answered whole');
    for (const item of answer.items) {
        t.equal(item.apiVersion, 'batch/v1', 'with the group and version the server used');
        t.equal(item.kind, 'Job', 'and the kind, which is what a key is built from');
    }
    t.equal(
        answer.items[0]?.metadata?.name,
        'migrate',
        'while everything the client did keep survives',
    );
    t.end();
});

test('an item that already knows what it is keeps its own answer', t => {
    // A custom resource reaches the adapter through `clusterCustomFind`, whose request carries the
    // group, version and plural — not the kind — so the identity is left exactly as the server sent
    // it, and never overwritten where it is already present.
    const answer = withItemIdentity(
        {
            items: [
                {
                    apiVersion: 'blong.feasible.one/v1alpha1',
                    kind: 'BlongDeployment',
                    metadata: {name: 'suite'},
                },
            ],
        },
        'custom',
    ) as {items: Array<{apiVersion?: string; kind?: string}>};

    t.equal(
        answer.items[0]?.apiVersion,
        'blong.feasible.one/v1alpha1',
        'the server’s version stands',
    );
    t.equal(
        answer.items[0]?.kind,
        'BlongDeployment',
        'and its kind, which the request does not name',
    );
    t.end();
});

test('an answer with nothing to identity passes through', t => {
    t.equal(withItemIdentity(undefined, 'job'), undefined, 'no answer, no work');
    const empty = withItemIdentity({items: []}, 'job');
    t.same(empty, {items: []}, 'and an empty list is not rebuilt into a lie');
    t.end();
});

test('a failure is read from the status the client actually reports', t => {
    // The generated client rejects with an `ApiException` carrying `{code, body, headers}` and **no**
    // `response.statusCode` (checked against @kubernetes/client-node 1.4.0), so a mapping that read
    // only the latter matched nothing: every 404, 401, 403 and 409 arrived as `k8s.failed` with
    // `status: "none"`, and an apply that could not tell "absent" from "unreadable" tried to create
    // an object that was already there (F-404).
    t.ok(isAbsent({code: 404, body: '{}'}), 'the status code an ApiException carries is read');
    t.ok(isAbsent({response: {statusCode: 404}}), 'and the one a transport failure carries');
    t.ok(isAbsent({type: 'k8s.notFound'}), 'and the typed error this adapter raises itself');
    t.ok(isAlreadyThere({code: 409}), 'a create that lost a race is recognised');
    t.ok(isAlreadyThere({type: 'k8s.exists'}), 'in either spelling');
    t.notOk(isAbsent({code: 500}), 'while a server error is neither absent nor present');
    t.notOk(isAbsent({code: 403}), 'nor is a forbidden read');
    t.notOk(isAlreadyThere({code: 404}), 'and the two are not the same question');
    t.notOk(isAbsent(undefined), 'nothing to read is not an absence');
    t.end();
});

/**
 * An update starts from the object that is already there.
 *
 * `apply` reads before it writes, and that read is where the fields a manifest
 * cannot express are visible — the server assigned them or defaulted them, and a
 * replace that omits them asks the API to clear them. Most kinds tolerate that
 * and land back on the default, which is why a blind replace went unnoticed; a
 * bound `PersistentVolumeClaim` does not, and the kustomize e2e lost a release
 * to it: every pass after the first was refused with
 * `spec is immutable after creation` (status 422) over a `volumeName` the tree
 * never mentioned.
 */
test('an update keeps the fields the server owns and the manifest cannot express', t => {
    const live = {
        apiVersion: 'v1',
        kind: 'PersistentVolumeClaim',
        metadata: {name: 'mysql-data', resourceVersion: '1911'},
        spec: {
            accessModes: ['ReadWriteOnce'],
            resources: {requests: {storage: '10Gi'}},
            storageClassName: 'local-path',
            volumeMode: 'Filesystem',
            volumeName: 'pvc-3e7d4bca-a1c9-4d0f-a3fd-d5faeeefcb9c',
        },
        status: {phase: 'Bound'},
    };
    const manifest = {
        apiVersion: 'v1',
        kind: 'PersistentVolumeClaim',
        metadata: {name: 'mysql-data'},
        spec: {accessModes: ['ReadWriteOnce'], resources: {requests: {storage: '10Gi'}}},
    };
    const body = withServerFields(live, manifest) as {spec: Record<string, unknown>};
    t.equal(
        body.spec.volumeName,
        'pvc-3e7d4bca-a1c9-4d0f-a3fd-d5faeeefcb9c',
        'the claim keeps the volume it bound to, which is the field the API refuses to see cleared',
    );
    t.equal(body.spec.storageClassName, 'local-path', 'and the class it was defaulted to');
    t.same(
        body.spec.accessModes,
        ['ReadWriteOnce'],
        'while the manifest still says what it does declare',
    );
    t.equal(body.spec.volumeMode, 'Filesystem', 'and a field neither of them names survives');
    t.end();
});

test('the merge stops at the first level under spec, so a declared object is the manifest’s', t => {
    const live = {spec: {template: {spec: {containers: [{name: 'mysql', args: ['--old']}]}}}};
    const manifest = {spec: {template: {spec: {containers: [{name: 'mysql', args: ['--new']}]}}}};
    const body = withServerFields(live, manifest) as {
        spec: {template: {spec: {containers: Array<{args: string[]}>}}};
    };
    t.same(
        body.spec.template.spec.containers[0]?.args,
        ['--new'],
        'a pod template belongs to the manifest whole, so a dropped argument disappears',
    );
    t.end();
});

test('a body with no spec on either side is handed back as it was', t => {
    const manifest = {apiVersion: 'v1', kind: 'ConfigMap', metadata: {name: 'suite-config'}};
    t.equal(
        withServerFields(manifest, manifest),
        manifest,
        'nothing to carry over and nothing to change',
    );
    t.equal(
        withServerFields(undefined, manifest),
        manifest,
        'an object that was not read cannot contribute a field',
    );
    t.equal(
        withServerFields({spec: {replicas: 1}}, manifest),
        manifest,
        'and a manifest with no spec is not given one from the object it replaces',
    );
    t.end();
});
