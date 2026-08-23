import {handler} from '@feasibleone/blong';

/**
 * Browser-side commander subject namespace — lets the portal/backend adapter
 * dispatch `commander.*` methods (`commander.source.list`,
 * `commander.branch.list`, `commander.node.*`) to the server gateway.
 */
export default handler(() => ({
    namespace: 'commander',
}));
