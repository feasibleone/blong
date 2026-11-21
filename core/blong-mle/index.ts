/**
 * @feasibleone/blong-mle — reusable MLE (Message Layer Encryption) client
 * crypto + self-contained HTTP client for Blong gateways.
 *
 * Extracted from `blong-gogo/src/jose.ts` + `blong-gogo/src/busGateway.ts` so
 * the codec and dev tooling (e.g. `blong-dev proxy`) share the same
 * implementation instead of duplicating it.
 */
import createMleCrypto from './src/crypto.ts';

export {
    createMleClient,
    type IMleAuth,
    type IMleCallOptions,
    type IMleClient,
    type IMleClientOptions,
} from './src/client.ts';
export {createMleCrypto, resolveKeySpec, type IMleCrypto, type KeySpec} from './src/crypto.ts';
export {createMleSession, type IMleSession, type IMleSessionOptions} from './src/session.ts';
export {
    isTextStream,
    readStream,
    streamSalt,
    type IReadStreamOptions,
    type IStreamResponse,
} from './src/streamRead.ts';
export {streamInfoOf} from './src/streamFrame.ts';
export {
    STREAM_BINARY_TYPE,
    STREAM_FLAG_BATCH,
    STREAM_FLAG_BINARY,
    STREAM_FLAG_SEALED,
    STREAM_MAX_FRAME_BYTES,
    STREAM_TEXT_TYPE,
    STREAM_PREFIX_BYTES,
    StreamFrameTooLarge,
    encodeFrame,
    frameDecoder,
    fromBase64,
    toBase64,
    valuesOfFrame,
    type IFrameDecoder,
    type IFrameDecoderOptions,
    type IStreamFrame,
} from './src/streamFrame.ts';
export {
    STREAM_INFO,
    STREAM_SALT_BYTES,
    deriveStreamKey,
    newStreamSalt,
    nonceOf,
    openFrame,
    saltFromHeader,
    saltToHeader,
    sealFrame,
    seqBytes,
    type IDeriveStreamKeyOptions,
} from './src/streamCipher.ts';

export default createMleCrypto;
