import {adapter} from '@feasibleone/blong';

/**
 * `adapter/task.ts` — the ticket pool as an adapter, so it can be replaced without touching the loop.
 *
 * `blong-task` will own tickets, claims and leases; this instance answers the same three methods over
 * a fixture until it does (`@@D-707`). It has no base adapter because there is no external system
 * behind it: the handlers in `adapter/task/` are the whole implementation, reached through the
 * namespace `task` (`task.next.claim`, `task.ticket.release`, `task.ticket.edit`).
 *
 * The namespace is the adapter's own, not the realm's, which is also why swapping the fixture for the
 * other realm changes one file and one `imports` entry rather than the vocabulary (`@@D-712`).
 */
export default adapter(() => ({
    extends: 'adapter.http',
    activation: {
        default: {
            // The pool is not an HTTP service yet; the URL exists because every adapter has one, and
            // nothing reaches it while the three handlers below answer.
            url: 'http://127.0.0.1:0',
            namespace: 'task',
            imports: [/\.task$/],
        },
    },
}));
