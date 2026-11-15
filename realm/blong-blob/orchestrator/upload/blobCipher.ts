/**
 * The cipher and the digest, re-exported for the `orchestrator/upload` group.
 *
 * An injected library function is private to the handler group that declares it — the loader builds a
 * group's `lib` from the `library()` files in its own folder — so a sibling group's library is not
 * visible here, and a group that needs one re-exports the definition rather than copying it. The
 * implementation lives beside the handlers that read a blob back (`../blob/blobCipher.ts`), because
 * the key and the algorithm are one decision of the realm (@@D-846).
 */
export {default} from '../blob/blobCipher.ts';
export type {IBlobCryptoSettings, IBlobLib} from '../blob/blobCipher.ts';
