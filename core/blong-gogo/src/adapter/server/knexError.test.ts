/**
 * The message a generic-CRUD refusal carries.
 *
 * `knex.generic` is the one error a reader cannot attribute from its name: it is
 * thrown where the adapter found no operation to serve, and the caller who saw it in
 * a dialog spent a day looking for a reserved word that was not there (`@@T-599` →
 * `@@D-742`). The method and the verb are interpolated into the message, and the
 * values reach the factory under `params` — that map is what it reads, not a property
 * on the error.
 */

import tap from 'tap';
import createErrorFactory from '../../error.ts';
import {errorMap} from './knex.ts';

const register = () => createErrorFactory({logLevel: 'warn'}).register(errorMap);

tap.test('knex.generic names the method and the operation it could not serve', async t => {
    const error = register()['knex.generic']({
        params: {method: 'marine.family.list', operation: 'list'},
    });
    t.equal(
        error.message,
        'Knex Error: no operation for list in marine.family.list',
        'the message carries both, so the dialog is a diagnosis',
    );
    t.equal(
        error.type,
        'knex.generic',
        'the type is unchanged, so a caller matching on it still does',
    );
});

tap.test('knex.generic reads well when the method has no verb at all', async t => {
    const error = register()['knex.generic']({
        params: {method: 'subjectObjectSchema', operation: '(none)'},
    });
    t.equal(
        error.message,
        'Knex Error: no operation for (none) in subjectObjectSchema',
        'a method with no verb says so instead of naming nothing',
    );
});

tap.test('knex.missingKey renders the key, not the placeholder', async t => {
    const error = register()['knex.missingKey']({params: {key: 'familyId'}});
    t.equal(error.message, 'Missing key value for familyId', 'the param reaches the message');
});
