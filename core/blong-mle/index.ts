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
export {createMleCrypto, type IMleCrypto, type KeySpec} from './src/crypto.ts';

export default createMleCrypto;
