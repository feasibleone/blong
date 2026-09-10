import {orchestrator} from '@feasibleone/blong';

/**
 * The `text` namespace.
 *
 * `orchestrator.dispatch` turns a `text.<object>.<predicate>` call into a lookup
 * in the handler group beside this file, and `namespace` is the id the port is
 * registered under — the same port a running gateway would route to, and the one
 * the CLI resolves a method against. That is the whole reason a command can
 * dispatch without an HTTP server: the handler table is already in the process.
 */
/**
 * The generic loosens the activation config: the `cli` block adds a `logLevel`
 * the `default` block does not carry, so without it the per-intent blocks would
 * have to be structurally identical.
 */
export default orchestrator<Record<string, unknown>>(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: 'text',
            imports: [/\.text$/],
            logLevel: 'info',
        },
        /**
         * The one line a command-driven realm still declares for itself.
         *
         * The framework's `cli` intent quietens its *own* components and the
         * generated-directory announcements, but a component's log level is part
         * of its activation and the framework does not know component names, so
         * it cannot default this. Without it the dispatch events
         * (`adapter.start`, `adapter.ready`, `adapter.stop`) are written straight
         * to fd 1 and land in the middle of the command's result.
         */
        cli: {logLevel: 'warn'},
    },
}));
