import {realm} from '@feasibleone/blong';

/**
 * server.ts — `party` realm entry point (server platform).
 *
 * The realm answers persons, organisations and the records hanging off them, and a person's
 * photograph is bytes, not a row: the store that keeps them is `blob`, a companion realm the suite
 * loads beside this one.
 */
export default realm(() => ({
    url: import.meta.url,
    config: {
        default: {
            // What this realm needs from the rest of the suite, which is the half a realm can answer:
            // it knows what it calls, and the store does not see who will use it. Naming `blob` is
            // what gives the store a process to ride — the processes that carry this realm — instead
            // of every process of the suite (`@@D-871`).
            k8s: {k8sNeeds: ['blob']},
        },
    },
}));
