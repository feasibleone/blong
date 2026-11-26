import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';

import {parseDocument, type Document} from 'yaml';

/**
 * The cipher, loaded through `require` because `ut-function.cbc` ships no types and this package
 * compiles JavaScript as well as TypeScript: with `allowJs` on, TypeScript resolves the import to the
 * package's own `.js` and reports it as untyped, while an ambient declaration is only consulted for a
 * module it cannot see. The cast below is the shape `types.d.ts` documents.
 */
const cbc = createRequire(import.meta.url)('ut-function.cbc') as CipherFactory;

/** What `ut-function.cbc` answers: the pair the configuration renderer is given. */
export interface ICipher {
    encrypt(data: string | Buffer): Buffer;
    decrypt(data: string | Buffer): string;
}

type CipherFactory = (key: string | Buffer, validate?: boolean) => ICipher;

/**
 * secret.ts — the master key, and the one value form a configuration may hold a secret in.
 *
 * `BLONG_MASTER_KEY` switches the configuration renderer on: the merged configuration is rendered as
 * templates with `cbc`'s pair in scope, so a value written as
 *
 *     password: ${decrypt('<hex>')}
 *
 * arrives at the component as the plaintext. That is the whole mechanism, and it is what makes an rc
 * file — or a `kubectl get secret -o yaml` — safe to read: what it holds is ciphertext, and the key
 * exists in exactly two places, the environment that starts the process and the Secret the tenant
 * keeps for it.
 *
 * The form is not obvious from either side of the framework, which is why it lives here rather than
 * being re-derived by every writer: **the ciphertext is hex**. `cbc.decrypt` answers an empty string
 * for a base64 blob rather than failing, so a tool that wrote base64 would produce a configuration
 * that starts and reads an empty password (`@@D-1023`). `secretDecrypt` refuses anything that is not
 * hex for that reason, and `secretIsSealed` recognises the file form so a writer can be idempotent.
 */

/** The environment variable a process reads the master key from. */
export const MASTER_KEY_ENV = 'BLONG_MASTER_KEY';

/** What a sealed value looks like in a file: a template whose only expression is `decrypt`. */
const SEALED = /^\$\{decrypt\('([0-9a-fA-F]+)'\)\}$/;

/** Hex only: what `cbc` reads correctly, and what a writer may therefore emit. */
const HEX = /^[0-9a-fA-F]+$/;

/** The key is 32 bytes, spelled as 64 hex characters — what `aes-256-cbc` takes. */
const KEY = /^[0-9a-fA-F]{64}$/;

/**
 * The master key from an environment, or a refusal that says what to do about it.
 *
 * Never logged, never included in an error: a message that quotes the key is a key in a log.
 */
export const masterKeyFrom = (env: Record<string, string | undefined> = process.env): string => {
    const key = env[MASTER_KEY_ENV];
    if (!key) {
        throw new Error(
            `${MASTER_KEY_ENV} is not set. It is the key that decrypts a configuration's secrets: ` +
                'export it from the Secret the tenant keeps for it, or generate one with ' +
                '`blong-dev secret key --new`.',
        );
    }
    if (!KEY.test(key)) {
        throw new Error(
            `${MASTER_KEY_ENV} is not 64 hex characters (32 bytes), which is the length aes-256-cbc ` +
                'takes. A key of another length encrypts nothing and decrypts nothing.',
        );
    }
    return key;
};

/** A new master key: 32 random bytes, hex. Written once and never rotated by a later run. */
export const masterKeyGenerate = (): string => randomBytes(32).toString('hex');

/** A random value — a password, a token — of the given byte length, hex. */
export const secretRandom = (bytes = 32): string => randomBytes(bytes).toString('hex');

/**
 * The pair the renderer spreads into its context: `renderAll(config, {...cbc(key)})`.
 *
 * Exported so a tool can check a value the way a load will, rather than re-deriving the call.
 */
export const cipherPair = (key: string): ICipher => cbc(key);

/** The ciphertext of a plaintext, hex, as the key encrypts it. */
export const secretEncrypt = (key: string, plaintext: string): string => {
    if (!KEY.test(key)) throw new Error(`${MASTER_KEY_ENV} is not 64 hex characters (32 bytes)`);
    return cbc(key).encrypt(plaintext).toString('hex');
};

/** What a file holds: the ciphertext wrapped in the expression the renderer resolves. */
export const secretExpression = (ciphertext: string): string =>
    HEX.test(ciphertext)
        ? `\${decrypt('${ciphertext}')}`
        : (() => {
              throw new Error('a sealed value is hex ciphertext; this is not');
          })();

/** Whether a file value is already sealed, so a writer can leave it alone. */
export const secretIsSealed = (value: unknown): boolean =>
    typeof value === 'string' && SEALED.test(value);

/**
 * Decrypt a value as a file holds it, or as a bare ciphertext.
 *
 * Both forms are accepted because both are in the wild: a writer that produced the expression, and
 * a ciphertext somebody is checking by hand. Anything else is refused rather than handed to `cbc`,
 * which answers an empty string for a value it cannot read — a silent empty password is worse than
 * a refusal.
 */
export const secretDecrypt = (key: string, value: string): string => {
    if (!KEY.test(key)) throw new Error(`${MASTER_KEY_ENV} is not 64 hex characters (32 bytes)`);
    const sealed = SEALED.exec(value);
    const ciphertext = sealed ? sealed[1] : value;
    if (!HEX.test(ciphertext)) {
        throw new Error(
            "a sealed value is a hex ciphertext, either bare or as ${decrypt('…')}; " +
                '`cbc.decrypt` answers an empty string for a base64 blob rather than failing, ' +
                'so this is refused instead of decrypting to nothing',
        );
    }
    return cbc(key).decrypt(Buffer.from(ciphertext, 'hex'));
};

/** Seal a plaintext for a file: encrypt it and wrap it in the expression the renderer resolves. */
export const secretSeal = (key: string, plaintext: string): string =>
    secretExpression(secretEncrypt(key, plaintext));

/**
 * The marker that says a value is to be sealed: `password: hunter2   # seal`.
 *
 * It is a comment because the file has to be readable in an editor before it is sealed — a tenant
 * writes the value it knows and marks it, and nothing else in the file changes. Sealing removes the
 * marker, so a file that was sealed once does not say so twice.
 */
export const SEAL_MARK = 'seal';

/** The marker as a trailing comment matches it. */
const MARK = /(^|\W)seal(\W|$)/i;

/**
 * Key names that are secrets by convention, so a value under one is sealed without a marker.
 *
 * Deliberately a closed list of names rather than a pattern over values: a tool that guessed from the
 * shape of a value would seal an id or a version, and a sealed non-secret is a value nobody can read
 * or explain. `password`, `secret`, `token` and `key` cover the framework's own configuration; a
 * tenant with something else marks it. The list is words rather than one alternation so each name
 * reads as the name it is, and the match is case-insensitive because a key may be either spelling.
 */
const SECRET_KEY_NAMES = new RegExp(
    `^(${[
        'password',
        'passwd',
        'secret',
        'token',
        'apiKey',
        'api_key',
        'apiSecret',
        'api_secret',
        'signingSecret',
        'signing_secret',
        'runtimeToken',
        'runtime_token',
        'authToken',
        'auth_token',
        'privateKey',
        'private_key',
        'masterKey',
        'master_key',
        'clientSecret',
        'client_secret',
    ].join('|')})$`,
    'i',
);

/** Whether a path's last segment names a secret by convention. */
export const isSecretKeyPath = (path: string): boolean =>
    SECRET_KEY_NAMES.test(path.split('.').pop() ?? '');

/** A path inside a document, as `dots.indices`: `srv.db.knex.connection.password`. */
const documentOf = (text: string): Document => {
    const document = parseDocument(text);
    const problem = document.errors[0];
    if (problem) throw new Error(`the file is not valid YAML: ${problem.message}`);
    return document;
};

/**
 * Seal the values at the given paths, in place.
 *
 * A path that reads no string, or that already holds a sealed value, is left as it is and reported:
 * the first is a typo in the path, the second makes the call idempotent, and neither is a reason to
 * write a file that changed nothing. The plaintext is never echoed.
 */
export const sealYaml = (
    text: string,
    paths: readonly string[],
    key: string,
): {text: string; sealed: string[]; missing: string[]; already: string[]} => {
    const document = documentOf(text);
    const sealed: string[] = [];
    const missing: string[] = [];
    const already: string[] = [];
    for (const path of paths) {
        const value = document.getIn(path.split('.'));
        if (typeof value !== 'string') {
            missing.push(path);
            continue;
        }
        if (secretIsSealed(value)) {
            already.push(path);
            continue;
        }
        document.setIn(path.split('.'), secretSeal(key, value));
        sealed.push(path);
    }
    return {text: sealed.length ? document.toString() : text, sealed, missing, already};
};

/** Read the values at the given paths back as plaintext, for a reader who holds the key. */
export const openYaml = (
    text: string,
    paths: readonly string[],
    key: string,
): {opened: Array<{path: string; value: string}>; missing: string[]; plain: string[]} => {
    const document = documentOf(text);
    const opened: Array<{path: string; value: string}> = [];
    const missing: string[] = [];
    const plain: string[] = [];
    for (const path of paths) {
        const value = document.getIn(path.split('.'));
        if (typeof value !== 'string') {
            missing.push(path);
            continue;
        }
        if (!secretIsSealed(value)) {
            plain.push(path);
            continue;
        }
        opened.push({path, value: secretDecrypt(key, value)});
    }
    return {opened, missing, plain};
};

/** Every sealed path in a document, so a reader can list what a file hides without opening it. */
export const sealedPaths = (text: string, prefix = ''): string[] => {
    const document = documentOf(text);
    const found: string[] = [];
    const walk = (value: unknown, path: string): void => {
        if (secretIsSealed(value)) {
            found.push(path);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach((entry, index) => walk(entry, `${path}.${index}`));
            return;
        }
        if (value !== null && typeof value === 'object') {
            for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
                walk(entry, path ? `${path}.${key}` : key);
            }
        }
    };
    walk(document.toJS(), prefix);
    return found;
};

/**
 * Seal every value that asks for it: marked with `# seal`, or held under a name that is a secret by
 * convention.
 *
 * This is the one call a provisioning step needs, because the file a tenant edits is the file the
 * command seals — there is no second list to keep in step, and a value the tenant marked is a value
 * it meant. A path already sealed is left alone, as is a non-string value: the call is idempotent,
 * which is what lets `provision` run on every pass.
 */
export const sealMarked = (
    text: string,
    key: string,
): {text: string; marked: string[]; known: string[]; missing: string[]} => {
    const document = documentOf(text);
    const marked: string[] = [];
    const known: string[] = [];
    const missing: string[] = [];
    const walk = (value: unknown, path: string): void => {
        if (Array.isArray(value)) {
            value.forEach((entry, index) => walk(entry, `${path}.${index}`));
            return;
        }
        if (value === null || typeof value !== 'object') return;
        for (const [name, entry] of Object.entries(value as Record<string, unknown>)) {
            const at = path ? `${path}.${name}` : name;
            if (entry !== null && typeof entry === 'object') {
                walk(entry, at);
                continue;
            }
            if (typeof entry !== 'string') continue;
            const node = document.getIn(at.split('.'), true) as
                | {comment?: string; commentBefore?: string}
                | undefined;
            if (secretIsSealed(entry)) {
                // Sealed already: the marker has done its job and does not belong in the file.
                if (node && MARK.test(String(node.comment ?? ''))) node.comment = undefined;
                continue;
            }
            if (!entry) {
                // An empty value is an answer that overrides a default (@@D-1026), and there is
                // nothing to seal: it is reported so the tenant can comment the line out.
                missing.push(at);
                continue;
            }
            const asked = node ? MARK.test(String(node.comment ?? '')) : false;
            if (!asked && !isSecretKeyPath(at)) continue;
            document.setIn(at.split('.'), secretSeal(key, entry));
            const written = document.getIn(at.split('.'), true) as {comment?: string} | undefined;
            if (written && asked) written.comment = undefined;
            (asked ? marked : known).push(at);
        }
    };
    walk(document.toJS(), '');
    return {
        text: marked.length || known.length ? document.toString() : text,
        marked,
        known,
        missing,
    };
};
