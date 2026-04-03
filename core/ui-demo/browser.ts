/**
 * browser.ts — ui-demo suite browser entry point.
 *
 * Wires the blong-ui built-in realm (RPC adapter, auth, portal) with the
 * marine biology demonstration realm so the two can cooperate in a single
 * browser registry during development and integration tests.
 */
import {browser} from '@feasibleone/blong';

export default browser(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        blongUi: blong.type.Object({}),
        marine: blong.type.Object({}),
    }),
    children: [
        /** Built-in blong-ui realm: RPC, auth, portal, auth orchestrators */
        async function blongUi() {
            return import('@feasibleone/blong-ui/browser.ts');
        },
        /** Marine biology demonstration realm */
        './marine',
    ],
    config: {
        default: {
            remote: {
                canSkipSocket: true,
            },
            blongUi: {},
            marine: {},
        },
        dev: {
            blongUi: {
                adapter: {
                    url: 'http://localhost:8080',
                },
            },
        },
    },
}));
