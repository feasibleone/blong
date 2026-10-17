import t from 'tap';

import password, {type PasswordLib} from './password.ts';

/**
 * The stored parameter document decides how a credential verifies.
 *
 * `access_credential.credentialParamsJSON` is JSON *text*, and the config's
 * `password` block is only a fallback for a row that carries none — otherwise a
 * database whose rows were hashed under other parameters stops authenticating
 * the moment the config changes, which is F-553. The access suite could not catch
 * that locally: a fresh database hashes every row with the config in force, so
 * the stored document and the fallback agree.
 */

/** The library factory, bound to a config that names a different iteration count. */
const bind = (passwordConfig: Record<string, unknown>): PasswordLib =>
    (password as unknown as (api: {config: Record<string, unknown>}) => PasswordLib)({
        config: {password: passwordConfig},
    });

t.test('a stored JSON document is honoured over the config fallback', t => {
    const lib = bind({iterations: 1});
    const stored = lib.hashPassword('secret', 'salt', {iterations: 5});

    t.ok(
        lib.verifyPassword('secret', stored.hash, 'salt', JSON.stringify(stored.params)),
        'the parameters the row carries verify it, though the config says one iteration',
    );
    t.ok(
        lib.verifyPassword('secret', stored.hash, 'salt', stored.params),
        'an object is accepted too — a JSON-typed column hands one over',
    );
    t.notOk(
        lib.verifyPassword('wrong', stored.hash, 'salt', JSON.stringify(stored.params)),
        'a wrong secret still fails',
    );
    t.end();
});

t.test('a row with no parameters falls back to the config', t => {
    const lib = bind({iterations: 5});
    const fromConfig = lib.hashPassword('secret', 'salt');

    t.equal(fromConfig.params.iterations, 5, 'the config decided the hash');
    t.ok(lib.verifyPassword('secret', fromConfig.hash, 'salt', null), 'and verifies it');
    t.ok(lib.verifyPassword('secret', fromConfig.hash, 'salt', undefined), 'with nothing stored');
    t.end();
});

t.test('a document that does not parse falls back rather than throwing', t => {
    const lib = bind({iterations: 1});
    const fromConfig = lib.hashPassword('secret', 'salt');

    t.ok(
        lib.verifyPassword('secret', fromConfig.hash, 'salt', '{not json'),
        'the config fallback still verifies its own hash',
    );
    t.notOk(
        lib.verifyPassword('secret', fromConfig.hash, 'salt', '{"iterations":5}'),
        'and a document that parses is used, so a foreign count does not verify',
    );
    t.end();
});
