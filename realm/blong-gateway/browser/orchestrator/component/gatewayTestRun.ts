import {handler} from '@feasibleone/blong';

/**
 * `gateway.test.run` — the Test runs page.
 *
 * The page lazy-loads from `src/pages/` so the Node tap runner can load this
 * handler without resolving `.tsx`. The menu item is declared only in the
 * `test-ui` config block of `index.browser.ts`, so a normal `gateway` portal
 * does not link to it.
 */
export default handler(function gatewayTestRun() {
    return {
        'gateway.test.run': async () => ({
            title: 'Test runs',
            icon: 'pi pi-play',
            component: async () => {
                const {TestRunGatewayPage} =
                    await import('../../../src/pages/gatewayTestRunPage.js');
                return TestRunGatewayPage;
            },
        }),
    };
});
