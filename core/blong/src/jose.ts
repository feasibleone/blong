import {
    CompactEncrypt,
    CompactSign,
    FlattenedEncrypt,
    FlattenedSign,
    GeneralEncrypt,
    GeneralSign,
    calculateJwkThumbprint,
    compactDecrypt,
    compactVerify,
    exportJWK,
    flattenedDecrypt,
    generalDecrypt,
    importJWK,
    type CompactDecryptResult,
    type FlattenedDecryptResult,
    type FlattenedJWE,
    type FlattenedJWS,
    type GeneralDecryptResult,
    type GeneralJWE,
    type GeneralJWS,
    type JWEHeaderParameters,
    type JWK,
    type KeyLike,
} from 'jose';

const isBrowser: boolean = typeof window !== 'undefined' && typeof window.document !== 'undefined';

const isKey = async (o): Promise<boolean> => {
    if (isBrowser) {
        return (
            typeof o === 'object' &&
            typeof o.extractable === 'boolean' &&
            typeof o.algorithm?.name === 'string' &&
            typeof o.type === 'string'
        );
    } else {
        const {
            types: {isKeyObject, isCryptoKey},
        } = (await import('node:util')).default;
        const {KeyObject} = (await import('node:crypto')).default;
        return isKeyObject
            ? isKeyObject(o)
            : KeyObject
            ? o instanceof KeyObject
            : isCryptoKey
            ? isCryptoKey(o)
            : typeof o === 'object' && o.constructor !== Object && typeof o.type === 'string';
    }
};

async function importKey(
    jwk: JWK | KeyLike | Uint8Array
): Promise<{key: KeyLike | Uint8Array; alg: string}> {
    const is = await isKey(jwk);
    const {alg} = is ? await exportKey(jwk as KeyLike | Uint8Array) : (jwk as JWK);

    return {
        key: is ? (jwk as KeyLike | Uint8Array) : await importJWK(jwk as JWK, alg),
        alg,
    };
}

async function exportKey(key: KeyLike | Uint8Array | JWK, priv: boolean = false): Promise<JWK> {
    const jwk: JWK = (await isKey(key))
        ? await exportJWK(key as KeyLike | Uint8Array)
        : (key as JWK);
    if (!jwk.kid) jwk.kid = await calculateJwkThumbprint(jwk);
    if (priv) return jwk;
    const {d, p, q, dp, dq, qi, ...publicJwk} = jwk; // eslint-disable-line @typescript-eslint/no-unused-vars
    return publicJwk;
}

async function sign(
    message: object,
    {key, alg}: {key: KeyLike | Uint8Array; alg: string},
    options: {serialization?: unknown}
): Promise<FlattenedJWS | GeneralJWS | string> {
    const payload = Buffer.isBuffer(message) ? message : Buffer.from(JSON.stringify(message));
    switch (options?.serialization) {
        case 'general':
            return new GeneralSign(payload).addSignature(key).setProtectedHeader({alg}).sign();
        case 'flattened':
            return new FlattenedSign(payload).setProtectedHeader({alg}).sign(key);
        default:
            return new CompactSign(payload).setProtectedHeader({alg}).sign(key);
    }
}

function encrypt(
    jws: string | Buffer,
    {key, alg}: {key: KeyLike | Uint8Array; alg: string},
    protectedHeader: object,
    unprotectedHeader: JWEHeaderParameters,
    options: {serialization?: unknown}
): Promise<string | FlattenedJWE | GeneralJWE> {
    switch (options?.serialization) {
        case 'compact':
            return new CompactEncrypt(Buffer.from(jws))
                .setProtectedHeader({
                    alg,
                    enc: 'A128CBC-HS256',
                    ...protectedHeader,
                })
                .encrypt(key);
        case 'flattened':
            return new FlattenedEncrypt(Buffer.from(jws))
                .setProtectedHeader({
                    alg,
                    enc: 'A128CBC-HS256',
                    ...protectedHeader,
                })
                .encrypt(key);
        default:
            return new GeneralEncrypt(Buffer.from(jws))
                .setProtectedHeader({
                    alg,
                    enc: 'A128CBC-HS256',
                    ...protectedHeader,
                })
                .setSharedUnprotectedHeader(unprotectedHeader)
                .addRecipient(key)
                .encrypt();
    }
}

async function decrypt(
    jwe: string | GeneralJWE,
    {key}: {key: KeyLike | Uint8Array},
    options?: {complete?: unknown}
): Promise<Uint8Array | CompactDecryptResult | GeneralDecryptResult | FlattenedDecryptResult> {
    const {plaintext, protectedHeader} =
        typeof jwe === 'string'
            ? await compactDecrypt(jwe, key)
            : jwe.recipients
            ? await generalDecrypt(jwe, key)
            : await flattenedDecrypt(jwe, key);
    return options?.complete ? {plaintext, protectedHeader} : plaintext;
}

async function verify(
    plaintext: string | Uint8Array,
    {key}: {key: KeyLike | Uint8Array}
): Promise<object> {
    return JSON.parse(new TextDecoder().decode((await compactVerify(plaintext, key)).payload));
}

async function signEncrypt(
    message: Parameters<typeof sign>[0],
    mlsk: Parameters<typeof sign>[1],
    mlekPub?: Parameters<typeof encrypt>[1],
    protectedHeader?: Parameters<typeof encrypt>[2],
    unprotectedHeader?: Parameters<typeof encrypt>[3],
    options?: {encrypt?: Parameters<typeof encrypt>[4]; sign?: Parameters<typeof sign>[2]}
): ReturnType<typeof encrypt> {
    return encrypt(
        (await sign(message, mlsk, options?.sign)) as string,
        mlekPub,
        protectedHeader,
        unprotectedHeader,
        options?.encrypt
    );
}

async function decryptVerify(
    message: Parameters<typeof decrypt>[0],
    mlskPub: Parameters<typeof verify>[1],
    mlek?: Parameters<typeof decrypt>[1]
): ReturnType<typeof verify> {
    return verify((await decrypt(message, mlek)) as Uint8Array, mlskPub);
}

export default async function jose({sign, encrypt}: {sign: JWK; encrypt: JWK}): Promise<{
    keys: {sign: JWK; encrypt: JWK};
    signEncrypt: (
        msg: Parameters<typeof signEncrypt>[0],
        key: Parameters<typeof importKey>[0],
        protectedHeader?: Parameters<typeof signEncrypt>[3],
        unprotectedHeader?: Parameters<typeof signEncrypt>[4],
        options?: Parameters<typeof signEncrypt>[5]
    ) => unknown;
    decryptVerify: (msg, key) => unknown;
    decrypt: (
        msg: string | GeneralJWE,
        options: unknown
    ) => ReturnType<typeof decrypt> | typeof msg;
    verify: (plaintext: string | Uint8Array, key: KeyLike | Uint8Array) => Promise<object>;
}> {
    const mlsk = sign && (await importKey(sign));
    const mlek = encrypt && (await importKey(encrypt));
    return {
        keys: {
            sign: sign && (await exportKey(sign)),
            encrypt: encrypt && (await exportKey(encrypt)),
        },
        signEncrypt: async (
            msg: Parameters<typeof signEncrypt>[0],
            key: Parameters<typeof importKey>[0],
            protectedHeader?: Parameters<typeof signEncrypt>[3],
            unprotectedHeader?: Parameters<typeof signEncrypt>[4],
            options?: Parameters<typeof signEncrypt>[5]
        ) =>
            mlsk
                ? signEncrypt(
                      msg,
                      mlsk,
                      await importKey(key),
                      protectedHeader,
                      unprotectedHeader,
                      options
                  )
                : msg,
        decryptVerify: async (msg, key) =>
            mlek ? decryptVerify(msg, await importKey(key), mlek) : msg,
        decrypt: (msg, options) => (mlek ? decrypt(msg, mlek, options) : msg),
        verify: async (msg, key) => verify(msg, await importKey(key)),
    };
}
