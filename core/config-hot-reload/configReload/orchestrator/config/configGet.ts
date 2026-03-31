import {handler} from '@feasibleone/blong';

/**
 * Demonstrates two correct config-access patterns side by side:
 *
 * 1. **Root proxy access** — `config` is the live proxy; every property
 *    lookup in the handler body reads the current effective value.
 *
 * 2. **Partial destructuring** — `theme` is an intermediate object destructured
 *    from `config` once when the handler factory runs (module load time).
 *    Because `theme` itself is a proxy node (not a scalar), any leaf read
 *    performed *inside* the handler body (e.g. `theme.name`) still reads the
 *    current value and is hot-reload safe.
 *
 * Rule: stop destructuring at the object level — never extract leaf primitives
 * in the factory argument.
 *
 *   ✅ Safe:   handler(({ config: { theme } }) => { … theme.name … })
 *   ❌ Unsafe: handler(({ config: { theme: { name } } }) => { … name … })
 *              — `name` is a primitive captured at load time; misses hot reload.
 */
export default handler(
    ({
        config,
        config: {theme},
    }: {
        config: Record<string, unknown> & {theme: Record<string, unknown>};
    }) => ({
        /**
         * Root proxy access pattern: `config.greeting` is evaluated inside the
         * handler body on every call — always returns the latest value.
         */
        configGet: () => ({
            greeting: config.greeting,
        }),

        /**
         * Partial destructuring pattern: `theme` was destructured from `config`
         * at factory time (it is a proxy sub-node, not a scalar). The leaf
         * value `theme.name` is evaluated inside this handler body on every
         * call — always returns the latest value.
         */
        configThemeGet: () => ({
            themeName: theme.name,
        }),
    }),
);
