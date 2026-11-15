import t from 'tap';

import {blobExpired, blobUploadRefusal} from '../../blob/blobUploadRules.ts';

const at = (iso: string | null) => ({expiresAt: iso});

t.test('a pending record with no bytes is incomplete', async t => {
    t.equal(blobUploadRefusal({state: 'pending', size: 0, expiresAt: null}), 'incomplete');
    t.equal(blobUploadRefusal({state: 'pending', size: 12, expiresAt: null}), null, 'bytes make it');
    t.equal(blobUploadRefusal({state: 'stored', size: 12, expiresAt: null}), null, 'stored is fine');
});

t.test('an expired record is refused before its state is looked at', async t => {
    const past = new Date(Date.now() - 1000).toISOString();
    t.equal(blobUploadRefusal({state: 'pending', size: 0, expiresAt: past}), 'expired');
    t.equal(
        blobUploadRefusal({state: 'stored', size: 12, expiresAt: past}),
        'expired',
        'a stored record that outlived its lifetime is expired too',
    );
    const future = new Date(Date.now() + 60_000).toISOString();
    t.equal(blobUploadRefusal({state: 'pending', size: 3, expiresAt: future}), null, 'time left is fine');
});

t.test('a record with no lifetime never expires', async t => {
    t.notOk(blobExpired(at(null)), 'no expiry is no expiry');
    t.ok(blobExpired(at(new Date(Date.now() - 1).toISOString())), 'a past one is expired');
    t.notOk(blobExpired(at(new Date(Date.now() + 60_000).toISOString())), 'a future one is not');
    t.notOk(blobExpired(at('not a date')), 'a value that is not a date refuses to guess');
});
