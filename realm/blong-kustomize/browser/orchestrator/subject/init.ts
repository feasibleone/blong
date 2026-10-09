import {handler} from '@feasibleone/blong';

/**
 * Browser-side subject namespace for the `kustomize` realm.
 *
 * A realm exposing portal pages MUST export its subject namespace here so the
 * browser can bind `kustomize.*` calls — without this file the browse pages fail
 * with "Method binding failed".
 *
 * The folder name `subject` stays LITERAL — do NOT replace it with the realm
 * name; only the `namespace` value is the realm's subject.
 *
 * `login` is listed for the same reason: the portal will not render a page until
 * it holds a token, and it asks for `login.token.create`. This realm answers that
 * method itself (it does not load the framework's `login` realm), so the front-end
 * orchestrator has to know the namespace or the login fails as
 * `remote.bindingFailed` with no request leaving the browser (F-371). A second
 * declaration file under a folder named after the namespace is not enough — the
 * registration belongs here, where the folder name stays literal.
 */
export default handler(() => ({
    namespace: ['kustomize', 'login'],
}));
