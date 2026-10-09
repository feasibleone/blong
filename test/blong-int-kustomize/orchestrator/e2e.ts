import {orchestrator} from '@feasibleone/blong';

/**
 * The `runbook` namespace.
 *
 * A layer's folders are not handlers until a *port* imports them, and the port needs a `namespace`:
 * that id is what the handlers are registered under, what a gateway would route to, and what the CLI
 * resolves a method against. Without it the handlers are attached and unreachable — which reads as
 * `unknown method` at the command line, exactly where this file came from.
 *
 * The tap groups are the other path (`discoverRealmTestMethods` reads `server/test/test/` directly),
 * which is why the assertions ran before this port existed and the commands did not.
 *
 * `orchestrator.dispatch` turns a `runbook.<object>.<predicate>` call into a lookup in the group
 * beside this file. The activation's `imports` matches the group folder's id (`…runbook`), and the
 * port's own file name is the second half of the config address the host writes —
 * `config.<intent>.runbook.e2e` — because "without a key under an active intent the child loads but
 * contributes no ports".
 */
export default orchestrator<Record<string, unknown>>(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: 'runbook',
            imports: [/\.runbook$/],
            logLevel: 'info',
        },
        /**
         * The one line a command-driven realm still declares for itself: a component's log level is
         * part of its activation and the framework does not know component names, so without this the
         * dispatch events (`adapter.start`, `adapter.ready`, `adapter.stop`) are written to fd 1 and
         * land in the middle of the command's result.
         */
        cli: {logLevel: 'warn'},
    },
}));
