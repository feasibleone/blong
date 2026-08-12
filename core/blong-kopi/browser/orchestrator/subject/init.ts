import {handler} from '@feasibleone/blong';

/**
 * Browser-side namespace for the `$subject` realm.
 *
 * A realm exposing portal pages MUST export its subject namespace here so the
 * browser can bind `$subject.*` calls — without this file the browse pages fail
 * with "Method binding failed". The namespace value is the realm's subject.
 */
export default handler(() => ({
    namespace: '$subject',
}));
