import {type IAssert, handler} from '@feasibleone/blong';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * server/test/test/testGatewayStatic.ts — a process's own block reaching the gateway port.
 *
 * This is the leg T-246 found unobservable. `core/blong-gogo/src/static.test.ts` proves the static
 * plugin serves a bundle and tolerates a missing one, and nothing proved that the root a process
 * names in its own config — a suite's `release` block points it at the artifact's browser build —
 * arrives at the port that hands it over. The plugin is registered only when that config is there, so
 * the failure this covers is a merge that drops the block: `/s` answers nothing while every other
 * surface works, and nobody notices until somebody opens the page.
 *
 * Registered as the `test.gateway.static` group (`integration.watch.test` in `index.ts`).
 */
export default handler(({lib: {group}, gateway}) => ({
    testGatewayStatic: ({name = 'gateway static'}: {name?: string} = {}) =>
        group(name)([
            async function theConfiguredRootReachedThePort(assert: IAssert) {
                const port = gateway as {staticRoot?: () => string | undefined};
                assert.equal(
                    typeof port.staticRoot,
                    'function',
                    'the port answers for the browser build it was configured with',
                );
                const root = port.staticRoot?.();
                // The same directory the entry's config names, derived here from this file rather than
                // spelled out, so the assertion is about the value that travelled and not about a
                // string that happens to match.
                assert.equal(
                    root,
                    fileURLToPath(new URL('../static', import.meta.url)),
                    'and it is the root this process named under its intent',
                );
                // The check the plugin itself makes before mounting `/s`, so the assertion above is
                // about a directory a build could be served from rather than about a string that
                // happens to be echoed back.
                assert.ok(
                    existsSync(join(String(root), 'index.html')),
                    'while the root holds a build rather than only being configured',
                );
            },
        ]),
}));
