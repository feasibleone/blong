import {handler} from '@feasibleone/blong';

/**
 * Browser-side login subject namespace.
 *
 * Lets the portal/backend adapter dispatch `login.*` methods
 * (`login.token.create` / `login.token.refresh` / `login.token.restore` /
 * `login.token.revoke`, `login.oidc.*`, …) to the server gateway — the same
 * way blong-access exposes `access.*` via its own
 * `browser/orchestrator/subject/init.ts`.  Without this file the browser has
 * no binding for the `login` namespace, so callers must use the explicit
 * `backend/login.*` form instead.
 *
 * The folder name `subject` stays LITERAL — only the `namespace` value is the
 * realm's subject.
 */
export default handler(() => ({
    namespace: 'login',
}));
