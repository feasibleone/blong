/**
 * MLE client crypto — extracted into the reusable `@feasibleone/blong-mle`
 * package so the codec and dev tooling (e.g. `blong-dev proxy`) share one
 * implementation instead of duplicating it.
 *
 * Re-exports the `createMleCrypto` factory (previously this module's default
 * export) unchanged — all existing callers keep working.
 */
export {default} from '@feasibleone/blong-mle';
