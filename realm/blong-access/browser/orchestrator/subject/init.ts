import {handler} from '@feasibleone/blong';

/**
 * Browser-side subject namespace — lets the portal/backend adapter dispatch
 * `access.*` model methods (access.user.find, access.role.get, …) to the
 * server gateway. Mirrors the server-side `orchestrator/subject/init.ts`.
 */
export default handler(() => ({
    namespace: 'access',
}));
