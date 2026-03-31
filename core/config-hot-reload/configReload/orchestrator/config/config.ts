/**
 * Default configuration for the `config.*` namespace handlers.
 * These values are available to handlers via the `config` argument.
 * In a real deployment, they would be overridden by external config files
 * that ConfigRuntime watches and reloads on change.
 */
export default {
    default: {
        greeting: 'hello',
        theme: {name: 'light'},
    },
};
