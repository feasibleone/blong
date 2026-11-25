import {handler} from '@feasibleone/blong';

/**
 * Browser-side subject namespace for the `agent` realm (`@@T-796`).
 *
 * A realm exposing portal pages declares its subject namespace here so the browser can bind
 * `agent.*` calls — without this file the page's `agent.session.find` fails with "Method binding
 * failed", which reads as a missing route rather than as a missing namespace.
 *
 * The folder name `subject` stays LITERAL; only the `namespace` value is the realm's subject.
 */
export default handler(() => ({
    namespace: 'agent',
}));
