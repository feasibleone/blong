import {realm} from '@feasibleone/blong';

/**
 * The orders realm: one namespace (`orders`), two API documents, two group folders to fill.
 *
 * The realm folder's name is the namespace the handlers are named for — `orders` + `ContractAdd` is
 * `ordersContractAdd` — while the two documents stay the publishers' own files, bound to that
 * namespace by `x-blong.namespace` in their wiring files.
 */
export default realm(() => ({
    url: import.meta.url,
    children: [],
    config: {
        default: {},
        dev: {},
    },
}));
