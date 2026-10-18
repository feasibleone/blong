/**
 * Register a test module's source map for browser stack-trace resolution @@D-583.
 *
 * Only modules under a `test/` folder are registered, and only in dev (`apply: 'serve'`).
 */
import {type Plugin} from 'vite';

/** Global read by `core/blong-chain/sourceMap.ts`; keep the two names in step. */
const REGISTRY = '__BLONG_SOURCE_MAPS__';

export function sourceMapRegister(): Plugin {
    return {
        name: 'blong-source-map-register',
        apply: 'serve',
        enforce: 'post',
        transform(code, id) {
            const file = id.split('?')[0] ?? id;
            if (file.includes('node_modules') || !/[\\/]test[\\/]/.test(file)) return null;
            if (!/\.[cm]?[jt]sx?$/.test(file) || /\.d\.[cm]?ts$/.test(file)) return null;

            const map = (() => {
                try {
                    return this.getCombinedSourcemap();
                } catch {
                    return undefined;
                }
            })();
            if (!map?.mappings) return null;

            // Source content would be copied into the page for no benefit: the pointer only needs
            // the mappings table.
            const compact = {
                version: map.version ?? 3,
                sources: map.sources,
                names: map.names,
                mappings: map.mappings,
            };
            // Appended after the module body, so the generated positions the map describes, and
            // therefore the stack line numbers, stay unchanged.
            const register = [
                '',
                `;(globalThis.${REGISTRY} ??= Object.create(null))[import.meta.url] = ${JSON.stringify(compact)};`,
                '',
            ].join('\n');
            return {code: `${code}${register}`, map};
        },
    };
}
