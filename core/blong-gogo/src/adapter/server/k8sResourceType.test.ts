import t from 'tap';

import {RESOURCE_TYPE_NAMES, canonicalResourceType, kindOfResource} from './k8s.ts';

/**
 * Every canonical resource type has to survive the trip back through the table.
 *
 * The adapter resolves a caller's spelling — singular or plural, either separator — through one
 * table, and then turns the canonical form into the Kubernetes client's method name. A compound kind
 * that the table does not list is not a lookup that fails with "unknown resource": it silently stays
 * glued, and the client is asked for a method that does not exist. The operator learned that with
 * `service_account`, which became `listNamespacedServiceaccount` — one word, one capital — and the
 * pass reported the suite's `service_account` as the step that failed, three layers from the cause
 * (`@@F-866`).
 *
 * So the invariant is stated once, over the whole table: a canonical spelling, asked for as itself,
 * comes back unchanged. A kind added to the realm's `RESOURCE_TYPE_BY_KIND` without an entry here
 * now fails a test instead of a deployment.
 */
t.test('a canonical resource type resolves to itself', async t => {
    for (const canonical of new Set(Object.values(RESOURCE_TYPE_NAMES))) {
        t.equal(canonicalResourceType(canonical), canonical, `${canonical} round-trips`);
        // The other spelling a caller may send: the words glued together, which is what a reader
        // typing a kind from memory produces, and what `RESOURCE_TYPE_BY_KIND` values are *not*.
        t.equal(
            canonicalResourceType(canonical.replace(/_/g, '')),
            canonical,
            `${canonical} is found glued too`,
        );
    }
});

t.test('the plural and the glued spellings reach the same type', async t => {
    t.equal(canonicalResourceType('serviceaccounts'), 'service_account', 'a plural is one type');
    t.equal(canonicalResourceType('serviceaccount'), 'service_account', 'and so is the glued name');
    t.equal(
        canonicalResourceType('ServiceAccount'),
        'service_account',
        'whatever case a caller sent it in',
    );
    t.equal(
        canonicalResourceType('persistentvolumeclaim'),
        'persistent_volume_claim',
        'the compound kind the operator already applied',
    );
});

t.test('the client spelling is the one the client has', async t => {
    // The method name the adapter builds is `listNamespaced${kindOfResource(type)}`, so this is the
    // half that has to match the generated client: every word capitalised, no separator left.
    t.equal(kindOfResource('service_account'), 'ServiceAccount', 'the words of the kind, joined');
    t.equal(
        kindOfResource('persistent_volume_claim'),
        'PersistentVolumeClaim',
        'as the client spells a claim',
    );
    t.equal(
        kindOfResource('serviceaccount'),
        'Serviceaccount',
        'while a glued spelling cannot be recovered — which is why the table has to hold it',
    );
});
