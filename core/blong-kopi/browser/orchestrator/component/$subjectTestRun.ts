import {handler} from '@feasibleone/blong';

/**
 * `$subject.test.run` — the Test runs page.
 *
 * The page lazy-loads from `src/pages/` so the Node tap runner can load this
 * handler without resolving `.tsx`. The menu item is declared only in the
 * `test-ui` config block of `index.browser.ts`, so a normal `$subject` portal
 * does not link to it.
 */
export default handler(function $subjectTestRun() {
    return {
        '$subject.test.run': async () => ({
            title: 'Test runs',
            icon: 'pi pi-play',
            component: async () => {
                const {TestRun$SubjectPage} =
                    await import('../../../src/pages/$subjectTestRunPage.js');
                return TestRun$SubjectPage;
            },
        }),
    };
});
