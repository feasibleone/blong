/**
 * kopi.ts — re-export of the realm scaffolding helper.
 *
 * The implementation lives in `@feasibleone/blong-kopi` (the template package);
 * blong-gogo depends on it and only re-exports here so the loader and CLI can
 * share a single source of truth.
 */
export {createRealm} from '@feasibleone/blong-kopi/kopi.ts';
export type {CreateRealmOptions} from '@feasibleone/blong-kopi/kopi.ts';
