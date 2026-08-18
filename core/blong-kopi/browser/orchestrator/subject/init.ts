import {handler} from '@feasibleone/blong';

/**
 * Browser-side subject namespace for the `$subject` realm.
 *
 * A realm exposing portal pages MUST export its subject namespace here so the
 * browser can bind `$subject.*` calls — without this file the browse pages fail
 * with "Method binding failed".
 *
 * The folder name `subject` stays LITERAL — do NOT replace it with the realm
 * name; only the `namespace` value is the realm's subject.
 */
export default handler(() => ({
    namespace: '$subject',
}));
