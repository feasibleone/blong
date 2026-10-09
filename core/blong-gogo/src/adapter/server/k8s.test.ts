import {test} from 'tap';

import {isAbsent, isAlreadyThere, kindOfResource, withItemIdentity} from './k8s.ts';

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
