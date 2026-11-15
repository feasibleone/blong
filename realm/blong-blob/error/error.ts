/**
 * error/error.ts — `blob` typed errors.
 *
 * One place, namespaced, parameterized: a handler throws `errors['blob.notFound']({params: {key,
 * namespace}})` and the message names the blob without the caller repeating it. The status codes are
 * the ones a browser and a cache understand — a missing blob is a 404 a client may retry, a scope
 * refusal is a 403 it must not, an expired upload is a 410 that says "do it again".
 */
export default {
    /** The key is not in the namespace's store, or its record was removed. */
    'blob.notFound': {
        message: 'Blob {namespace}/{key} not found',
        statusCode: 404,
    },
    /** The caller presented no scope the blob names, or a cookie that did not verify. */
    'blob.scopeDenied': {
        message: 'Reading blob {namespace}/{key} needs a scope this caller does not hold',
        statusCode: 403,
        silent: true,
    },
    /** The payload is larger than `blob.upload.maxBytes`. */
    'blob.tooLarge': {
        message: 'The blob is {size} bytes; the limit is {limit}',
        statusCode: 413,
    },
    /** The extension is not in the supported table. */
    'blob.extensionNotAllowed': {
        message: 'Files of type .{extension} are not accepted',
        statusCode: 415,
    },
    /** The declared content type does not belong to the extension. */
    'blob.contentTypeMismatch': {
        message: 'A .{extension} file cannot be {contentType}',
        statusCode: 415,
    },
    /** The upload was prepared, nobody wrote it, and its lifetime ran out. */
    'blob.uploadExpired': {
        message: 'Upload {key} expired at {expiresAt}',
        statusCode: 410,
    },
    /** The bytes have not arrived, or arrived short of what the record promised. */
    'blob.uploadIncomplete': {
        message: 'Upload {key} is not complete',
        statusCode: 409,
    },
    /** The bytes arrived twice for one upload, so the second write is refused rather than overwrite. */
    'blob.uploadAlreadyStored': {
        message: 'Upload {key} has already been stored',
        statusCode: 409,
    },
    /** A configured value names something this process cannot resolve, such as a scope provider. */
    'blob.configurationError': {
        message: 'The blob realm is misconfigured: {reason}',
        statusCode: 500,
    },
    /** The backend refused or failed the operation. */
    'blob.storageFailed': {
        message: 'The blob store failed: {reason}',
        statusCode: 502,
    },
    /** The bytes do not match what the record says they are. */
    'blob.corrupt': {
        message: 'Blob {namespace}/{key} does not match its record',
        statusCode: 500,
    },
    /** The namespace is not one this process was configured to serve (@@D-845). */
    'blob.namespaceUnknown': {
        message: 'Namespace {namespace} is not served by this process',
        statusCode: 404,
        silent: true,
    },
    /** No encryption key is configured, so nothing may be written or read. */
    'blob.cryptoUnconfigured': {
        message: 'The blob store has no encryption key',
        statusCode: 500,
    },
    /** The configured key is not one AES-256 can use. */
    'blob.cryptoInvalid': {
        message: 'The blob encryption key is {length} bytes; it must be 32',
        statusCode: 500,
    },
};
