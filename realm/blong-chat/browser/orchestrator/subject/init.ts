import {handler} from '@feasibleone/blong';

/**
 * Browser-side subject namespace for the `chat` realm.
 *
 * A realm exposing portal pages MUST register its subject namespace here, or the generated
 * `chat.account.*` pages fail with "Method binding failed" and no request leaves the browser. The
 * folder name `subject` stays literal; only the `namespace` value is the realm's subject.
 */
export default handler(() => ({
    namespace: 'chat',
}));
