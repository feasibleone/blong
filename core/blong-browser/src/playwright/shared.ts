/**
 * A Playwright test whose portal is signed in **once per worker**.
 *
 * The largest cost of a spec is the boot: a fresh browser context fetches the app, draws
 * the login screen, signs in and waits for the composed portal before the first click —
 * ten seconds on a CI runner. A spec with thirty short tests pays it thirty times; for the
 * hundred tests of a full suite it is most of the run (`@@D-748`).
 *
 * So this test object opens one browser context per worker and signs in the first time a
 * test asks for a portal. Every test after it drives the same signed-in page, with all tabs
 * closed when the previous test ended: the portal is a shell over an empty canvas, so "no
 * tabs" is the state a fresh boot leaves it in.
 *
 * What that trades away, and what a spec must therefore not do:
 *
 * - **Isolation.** A test that changes something which is not a tab — the language, the
 *   permission flag, a feedback mode, a translation loader — changes it for the tests after
 *   it. A file using this object sets those once with `test.use`, before the session boots.
 * - **A clean retry.** A test that fails mid-form leaves that form in the tab it opened; the
 *   fixture closes tabs in `finally`, so the retry starts from the empty portal, but nothing
 *   here can undo a half-written record on the server.
 * - **Translation harvesting.** `blongTranslationSeed` collects what one page rendered, so a
 *   shared page would report one test's screens as another's. A file that harvests keeps the
 *   per-test `portal` from `@feasibleone/blong-browser/playwright`.
 *
 * The first attempt at this failed exactly where one page outlives one test: a record
 * created in this session was missing from the next form's pickers, because the option lists
 * were cached for the life of the page. That was a real defect in the app rather than a
 * property of sharing — a user met it too, as "reload to see the record you just made" — and
 * it is fixed where a page reads its lists (`openTab` clears them).
 *
 * Opting in is one import line — `import {expect, test} from
 * '@feasibleone/blong-browser/playwright/shared'` — and the rest of a spec is unchanged.
 */
import type {BrowserContext, Page} from '@playwright/test';
import {BLONG_ELEMENT_TIMEOUT, Portal, openPortal, test as perTest} from '../playwright.js';

/** The page a worker keeps for the whole of its life. */
export interface ISharedSession {
    /** The one page every test in this worker drives. */
    page: Page;
    /** Its context, so the worker closes exactly what it opened. */
    context: BrowserContext;
    /** Whether the first test has already signed this page in. */
    signedIn: boolean;
}

export const test = perTest.extend<{portal: Portal}, {sharedSession: ISharedSession}>({
    sharedSession: [
        async ({browser}, use) => {
            const context = await browser.newContext();
            const page = await context.newPage();
            await use({page, context, signedIn: false});
            await context.close();
        },
        {scope: 'worker'},
    ],

    portal: async (
        {
            sharedSession,
            blongUsername,
            blongPassword,
            blongPermissions,
            blongLanguage,
            blongExpectedBrowserErrors,
        },
        use,
    ) => {
        // The first test pays the boot and the sign-in; the ones after it inherit them.
        // The options are read here rather than in the worker fixture because they are
        // per-file options, and a file that sets them sets them before its first test.
        if (!sharedSession.signedIn) {
            await openPortal(sharedSession.page, {
                username: blongUsername,
                password: blongPassword,
                permissions: blongPermissions,
                language: blongLanguage,
            });
            sharedSession.signedIn = true;
        }
        // A previous test may have thrown before its first await; the portal is expected to
        // be standing either way.
        await sharedSession.page
            .locator('.blong-portal-menubar')
            .waitFor({state: 'visible', timeout: BLONG_ELEMENT_TIMEOUT});

        const portal = new Portal(sharedSession.page, {expected: blongExpectedBrowserErrors});
        // A test that threw left its tabs behind; clearing here as well as at the end means
        // the next test starts from the empty portal either way, without a `try/finally`
        // around the fixture's `use()` (which the lint rules read as a React Hook).
        await portal.tabsCloseAll().catch(() => undefined);
        // eslint-disable-next-line @eslint-react/rules-of-hooks -- Playwright fixture `use()`, not a React Hook
        await use(portal);
        // Back to the empty portal whether the test passed or threw: the next test must
        // start where a boot would have left it.
        await portal.tabsCloseAll().catch(() => undefined);
        if (portal.fatalError !== undefined) throw portal.failure(portal.fatalError);
    },
});

export {expect} from '@playwright/test';
