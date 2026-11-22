import {server} from '@feasibleone/blong';

/**
 * The demo suite: two realms — one namespace serving two published documents, one serving a single
 * API.
 *
 * Run it from this folder with `blong ./server.ts dev`. Under `dev` the generator is on, so every
 * operation of either document that has no handler file gets a typed stub — which is the whole point
 * of the demo. Ports are `0` so a run never collides with anything else on the machine.
 */
export default server(() => ({
    url: import.meta.url,
    children: ['./orders', './stock'],
    config: {
        default: {
            // A child is loaded only when its name has a block, so these lines are the difference
            // between a realm that loads and one that is silently skipped.
            orders: {},
            stock: {},
            rpcServer: {port: 0},
            gateway: {port: 0},
        },
        dev: {},
    },
}));
