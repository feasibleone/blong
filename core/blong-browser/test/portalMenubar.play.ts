/**
 * The portal menubar keeps its natural height at every display width.
 *
 * The menubar is a *strip*: a row of menu items, a hamburger button and the App widgets on the
 * right, whose height is its content's. Its container is the portal, a column flex box, so a
 * `flex-grow` on the menubar buys **height** rather than width — which is what a rule in
 * `Portal.css` asked for below 960px, and what made a narrow window (a Storybook frame, a
 * documentation embed, a phone) show a 341px-tall bar containing one 28px button, with the page
 * pushed below it. The fix is that rule's removal, and this is the guard on it: measured as a
 * relation between two widths rather than an absolute height, so a change to paddings, fonts or
 * the theme is not a failure.
 *
 * The mobile mode is asserted too, because "keep the height" has an easy wrong answer — hiding the
 * menu — and PrimeReact's mode is what makes the bar short in the first place.
 *
 * Run with the package's own Playwright config, which starts `npm run storybook` as the webServer:
 *
 *     node --run playwright -- test/portalMenubar.play.ts
 */
import {expect, test, type Page} from '@playwright/test';

/** A width below PrimeReact's 960px breakpoint, where the root list hides behind the button. */
const MOBILE_WIDTH = 420;

/** The width the config runs at; the comparison is against the bar here. */
const WIDE_WIDTH = 1400;

/** The menubar's rendered height in whole pixels, or -1 when it is not there. */
async function menubarHeight(page: Page): Promise<number> {
    const box = await page.locator('.p-menubar').boundingBox();
    return box === null ? -1 : Math.round(box.height);
}

test.describe('the portal menubar', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/iframe.html?id=portal--with-menu&viewMode=story');
        await expect(page.locator('.p-menubar')).toBeVisible();
    });

    test('is no taller at a narrow width than at a wide one', async ({page}) => {
        const wide = await menubarHeight(page);
        await page.setViewportSize({width: MOBILE_WIDTH, height: 900});
        // The switch to mobile mode is a media query, so the layout settles on the next frame.
        await page.waitForTimeout(500);
        const narrow = await menubarHeight(page);

        expect(wide, 'the wide bar has a height to compare against').toBeGreaterThan(0);
        expect(
            narrow,
            `the menubar grew from ${wide}px at ${WIDE_WIDTH}px to ${narrow}px at ${MOBILE_WIDTH}px: ` +
                "a strip in a column layout must not take the column's free space",
        ).toBeLessThanOrEqual(wide + 8);
    });

    test('toggles its menu from the button in mobile mode', async ({page}) => {
        await page.setViewportSize({width: MOBILE_WIDTH, height: 900});
        await page.waitForTimeout(500);
        const list = page.locator('.p-menubar-root-list');
        // Judged as a *change* rather than as "closed, then open": the story's own `play` opens
        // the menu, so an assertion on the initial state is a race against it.
        const wasOpen = await list.isVisible();
        // Dispatched rather than clicked: the same play raises a toast over the menubar's
        // right-hand region, and a click — even a forced one, which still lands on the toast —
        // would either be retried (toggling twice) or never arrive.
        await page.locator('.p-menubar-button').dispatchEvent('click');
        await expect.poll(() => list.isVisible(), {timeout: 5_000}).toBe(!wasOpen);
        // A mobile menu that opens empty would pass the toggle check and still leave a reader
        // without the realm's navigation.
        if (!wasOpen) await expect(list).toContainText('View');
    });
});
