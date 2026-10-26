import {handler} from '@feasibleone/blong';

/**
 * Browser-side subject namespace for `core`.
 *
 * Lets the portal/backend adapter dispatch `core.*` methods (`core.label.list`,
 * `core.translation.list`, the editor pages) to the server gateway, the way
 * `blong-login` and `blong-access` do. The folder name `subject` stays literal;
 * only the `namespace` value is the realm's subject.
 */
export default handler(() => ({
    namespace: 'core',
}));
