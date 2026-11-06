import {handler} from '@feasibleone/blong';

/**
 * `sport.test.run` — the Test runs page.
 *
 * The page lazy-loads from `src/pages/` so the Node tap runner can load this
 * handler without resolving `.tsx`. The menu item is declared only in the
 * `test-ui` config block of `index.browser.ts`, so a normal `sport` portal
 * does not link to it — and the slice names its permission so a role without the
 * test capability is not offered it either.
 */
export default handler(function sportTestRun() {
    return {
        'sport.test.run': async () => ({
            title: 'Test runs',
            permission: 'test.run.start',
            icon: 'pi pi-play',
            component: async () => {
                const {TestRunSportPage} = await import('../../../src/pages/sportTestRunPage.js');
                return TestRunSportPage;
            },
        }),
    };
});
