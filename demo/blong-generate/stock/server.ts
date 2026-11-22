import {realm} from '@feasibleone/blong';

/**
 * The stock realm: one namespace (`stock`), one published API, one group folder to fill.
 *
 * It is here beside the orders realm to show the other half of the arrangement: a realm whose
 * namespace names the same entity its documents do, so the wiring file only has to map the
 * operations (`getStockItem` → `ItemGet`) and needs no `x-blong.namespace` of its own beyond saying
 * so plainly.
 */
export default realm(() => ({
    url: import.meta.url,
    children: [],
    config: {
        default: {},
        dev: {},
    },
}));
