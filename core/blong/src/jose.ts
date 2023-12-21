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
    importJWK
} from 'jose';

const isBrowser: boolean = typeof window !== 'undefined' && typeof window.document !== 'undefined';

const isKey = async(o) => {
    if (isBrowser) {
        return typeof o === 'object' &&
                typeof o.extractable === 'boolean' &&
                typeof o.algorithm?.name === 'string' &&
                typeof o.type === 'string';
    } else {
        const {types: {isKeyObject, isCryptoKey}} = (await import('node:util')).default;
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

async function importKey(jwk) {
    const is = await isKey(jwk);
    const {alg} = is ? await exportKey(jwk) : jwk;

    return {
        key: is ? jwk : await importJWK(jwk, alg),
        alg
    };
}

async function exportKey(key, priv = false) {
    const jwk = await isKey(key) ? await exportJWK(key) : key;
    if (!jwk.kid) jwk.kid = await calculateJwkThumbprint(jwk);
    if (priv) return jwk;
    const { d, p, q, dp, dq, qi, ...publicJwk } = jwk;
    return publicJwk;
}

async function sign(message, {key, alg}, options) {
    const payload = Buffer.isBuffer(message) ? message : Buffer.from(JSON.stringify(message));
    switch (options?.serialization) {
        case 'general':
            return new GeneralSign(payload)
                .addSignature(key)
                .setProtectedHeader({alg})
                .sign();
        case 'flattened':
            return new FlattenedSign(payload)
                .setProtectedHeader({alg})
                .sign(key);
        default:
            return new CompactSign(payload)
                .setProtectedHeader({alg})
                .sign(key);
    }
}

function encrypt(jws, {key, alg}, protectedHeader, unprotectedHeader, options) {
    switch (options?.serialization) {
        case 'compact':
            return new CompactEncrypt(Buffer.from(jws))
                .setProtectedHeader({
                    alg,
                    enc: 'A128CBC-HS256',
                    ...protectedHeader
                })
                .encrypt(key);
        case 'flattened':
            return new FlattenedEncrypt(Buffer.from(jws))
                .setProtectedHeader({
                    alg,
                    enc: 'A128CBC-HS256',
                    ...protectedHeader
                })
                .encrypt(key);
        default:
            return new GeneralEncrypt(Buffer.from(jws))
                .setProtectedHeader({
                    alg,
                    enc: 'A128CBC-HS256',
                    ...protectedHeader
                })
                .setSharedUnprotectedHeader(unprotectedHeader)
                .addRecipient(key)
                .encrypt();
    }
}

async function decrypt(jwe, {key}, options?) {
    const { plaintext, protectedHeader } = typeof jwe === 'string'
        ? await compactDecrypt(jwe, key)
        : jwe.recipients
            ? await generalDecrypt(jwe, key)
            : await flattenedDecrypt(jwe, key);
    return options?.complete
        ? { plaintext, protectedHeader }
        : plaintext;
}

async function verify(plaintext, {key}) {
    return JSON.parse(new TextDecoder().decode((await compactVerify(plaintext, key)).payload));
}

async function signEncrypt(message, mlsk, mlekPub, protectedHeader, unprotectedHeader, options) {
    return encrypt(
        await sign(message, mlsk, options?.sign),
        mlekPub,
        protectedHeader,
        unprotectedHeader, options?.encrypt
    );
}

async function decryptVerify(message, mlskPub, mlek) {
    return verify(
        await decrypt(message, mlek),
        mlskPub
    );
}

export default async function jose({sign, encrypt}) {
    const mlsk = sign && await importKey(sign);
    const mlek = encrypt && await importKey(encrypt);
    return {
        keys: {
            sign: sign && await exportKey(sign),
            encrypt: encrypt && await exportKey(encrypt)
        },
        signEncrypt: async(msg, key, protectedHeader?, unprotectedHeader?, options?) => mlsk
            ? signEncrypt(msg, mlsk, await importKey(key), protectedHeader, unprotectedHeader, options)
            : msg,
        decryptVerify: async(msg, key) => mlek ? decryptVerify(msg, await importKey(key), mlek) : msg,
        decrypt: (msg, options) => mlek ? decrypt(msg, mlek, options) : msg,
        verify: async(msg, key) => verify(msg, await importKey(key))
    };
}
