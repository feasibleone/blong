import {handler} from '@feasibleone/blong';

/**
 * Server-side subject namespace for the `$subject` realm.
 *
 * This registers the `<realm>.subject` handler group which the shared
 * `@feasibleone/blong-server` subject orchestrator attaches (`imports:
 * /\.subject$/`) and forwards to the `db` destination. Do NOT create a
 * realm-local dispatch orchestrator — reuse blong-server's.
 *
 * The folder name `subject` stays LITERAL — do NOT replace it with the realm
 * name; only the `namespace` value is the realm's subject.
 */
export default handler(() => ({
    namespace: '$subject',
}));
