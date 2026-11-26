import {test} from 'tap';

import {
    MASTER_KEY_ENV,
    cipherPair,
    isSecretKeyPath,
    masterKeyFrom,
    masterKeyGenerate,
    openYaml,
    sealMarked,
    sealYaml,
    sealedPaths,
    secretDecrypt,
    secretEncrypt,
    secretExpression,
    secretIsSealed,
    secretRandom,
    secretSeal,
} from './secret.ts';

const key = 'a'.repeat(64);

/** The message of a refusal: `t.throws` here cannot take the pattern, so the text is matched. */
const refusal = (fn: () => unknown): string => {
    try {
        fn();
    } catch (error) {
        return (error as Error).message;
    }
    return '';
};

await test('the master key is 32 bytes of hex, and a wrong one is refused', async t => {
    t.equal(masterKeyFrom({[MASTER_KEY_ENV]: key}), key, 'a 64-character hex key is read');
    t.match(
        refusal(() => masterKeyFrom({})),
        /BLONG_MASTER_KEY is not set/,
        'nothing set is a refusal that says how to make one',
    );
    t.match(
        refusal(() => masterKeyFrom({[MASTER_KEY_ENV]: 'a'.repeat(32)})),
        /not 64 hex characters/,
        'a 32-character key is the mistake that looks right: aes-256 takes 32 *bytes*',
    );
    const generated = masterKeyGenerate();
    t.equal(generated.length, 64, 'a generated key is 64 hex characters');
    t.not(generated, masterKeyGenerate(), 'and a second one is different');
    t.equal(secretRandom(16).length, 32, 'a random value is hex of the bytes it was asked for');
});

await test('a sealed value is hex ciphertext in the expression the renderer resolves', async t => {
    const sealed = secretSeal(key, 'pass word');
    t.ok(secretIsSealed(sealed), 'the file form is recognised');
    // The renderer is what resolves it at load; its only part in the form is the expression, so the
    // pair it is given is what this checks against (`renderAll(`${sealed}`, {...cbc(key)})`).
    t.equal(
        cipherPair(key).decrypt(sealed.slice("${decrypt('".length, -2)),
        'pass word',
        'and the cipher resolves the value it wraps',
    );
    // Both forms are read: the expression a file holds and the bare ciphertext somebody pastes.
    t.equal(
        secretDecrypt(key, secretEncrypt(key, 's3cr3t')),
        's3cr3t',
        'a bare ciphertext decrypts',
    );
    t.equal(secretDecrypt(key, sealed), 'pass word', 'and so does the expression');
    // Two encryptions of one plaintext differ by design (a fresh IV each time), so the expression is
    // checked against the ciphertext it was given rather than against a second seal.
    const ciphertext = secretEncrypt(key, 'x');
    t.equal(
        secretExpression(ciphertext),
        `\${decrypt('${ciphertext}')}`,
        'the expression is the ciphertext in the call the renderer resolves',
    );
    const sealedOnce = secretSeal(key, 'x');
    t.ok(secretIsSealed(sealedOnce), 'and sealing wraps the ciphertext in that call');
    t.equal(secretDecrypt(key, sealedOnce), 'x', 'which decrypts back');
});

await test('base64 is refused because cbc would answer an empty string', async t => {
    // The defect this guards: `cbc.decrypt` reads a key and a ciphertext as hex, so a base64 blob
    // decrypts to '' rather than failing — a configuration that starts and holds an empty password.
    const base64 = Buffer.from(secretEncrypt(key, 's3cr3t'), 'hex').toString('base64');
    t.match(
        refusal(() => secretDecrypt(key, base64)),
        /hex ciphertext/,
        'a base64 value is refused with the reason',
    );
    t.match(
        refusal(() => secretExpression(base64)),
        /hex ciphertext/,
        'and it cannot be written either',
    );
});

await test('sealing a file touches the named paths and nothing else', async t => {
    const yaml = [
        'srv:',
        '  db:',
        '    knex:',
        '      connection:',
        '        host: db',
        '        password: hunter2',
        'agent:',
        '  engine:',
        '    accounts:',
        '      main:',
        "        apiKey: ${decrypt('" + secretEncrypt(key, 'already') + "')}",
        '',
    ].join('\n');
    const {text, sealed, missing, already} = sealYaml(
        yaml,
        ['srv.db.knex.connection.password', 'agent.engine.accounts.main.apiKey', 'srv.db.nope'],
        key,
    );
    t.same(sealed, ['srv.db.knex.connection.password'], 'the plaintext value is sealed');
    t.same(already, ['agent.engine.accounts.main.apiKey'], 'a sealed one is left alone');
    t.same(missing, ['srv.db.nope'], 'a path that reads nothing is reported, not invented');
    t.not(text, yaml, 'the file changed');
    t.not(text.includes('hunter2'), true, 'and the plaintext is gone from it');
    t.equal(
        openYaml(text, ['srv.db.knex.connection.password'], key).opened[0].value,
        'hunter2',
        'while the value a reader opens is the plaintext',
    );
    t.equal(
        sealYaml(text, ['srv.db.knex.connection.password'], key).text,
        text,
        'a second seal is a no-op',
    );
});

await test('a value is sealed when it asks, or when its name says so', async t => {
    const text = [
        'srv:',
        '  db:',
        '    connection:',
        '      user: bob',
        '      password: hunter2   # seal',
        'agent:',
        '  accounts:',
        '    main:',
        '      runtimeToken: tkn-123',
        '  label: plain',
        '',
    ].join('\n');
    const sealed = sealMarked(text, key);
    t.same(sealed.marked, ['srv.db.connection.password'], 'a marked value is sealed');
    t.same(sealed.known, ['agent.accounts.main.runtimeToken'], 'and one under a secret name too');
    t.not(sealed.text.includes('hunter2'), true, 'the plaintext is gone');
    t.not(sealed.text.includes('# seal'), true, 'and the marker with it');
    t.equal(sealed.text.includes('user: bob'), true, 'a value that is neither is left alone');
    t.equal(isSecretKeyPath('a.b.apiKey'), true, 'a conventional name is one');
    t.equal(isSecretKeyPath('a.b.hostName'), false, 'and an ordinary one is not');
    t.equal(sealMarked(sealed.text, key).text, sealed.text, 'a second run changes nothing');
    // An empty value overrides a default, so it is reported rather than sealed (D-1026).
    const empty = sealMarked('a:\n  password: ""\n', key);
    t.same(empty.missing, ['a.password'], 'an empty value is reported');
    t.equal(empty.text.includes('decrypt'), false, 'and nothing is written for it');
});

await test('a reader can list what a file hides without opening it', async t => {
    const yaml = [
        'a:',
        `  b: ${secretSeal(key, 'one')}`,
        '  c: plain',
        'd:',
        `  - ${secretSeal(key, 'two')}`,
        '',
    ].join('\n');
    t.same(sealedPaths(yaml), ['a.b', 'd.0'], 'every sealed path, in document order');
    t.same(
        openYaml(yaml, ['a.b', 'd.0', 'a.c'], key).plain,
        ['a.c'],
        'and a path that is not sealed is reported as plain rather than as an error',
    );
});
