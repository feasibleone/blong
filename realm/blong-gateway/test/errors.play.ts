import {expect, test} from '@feasibleone/blong-browser/playwright';

/**
 * The reporting path, exercised on purpose.
 *
 * These specs exist because the opposite failure is the expensive one: for a long
 * while every page in another realm showed an error dialog that reached no
 * terminal, so the only visible symptom was an element that never appeared. The
 * fix was to collect what the browser says, echo it, and give up a wait the moment
 * the page throws — and none of that is worth anything unless something proves it
 * still works.
 *
 * One spec stays green by asserting what was collected; the other is expected to
 * fail, because a reporting path that is never exercised on a failure is a claim,
 * not a mechanism.
 */
test('browser errors are collected with enough context to place them', async ({portal}) => {
    await portal.page.evaluate(() => {
        console.error('[test] deliberate console error');
        // A request that cannot succeed. Not a 404 on a path of this app: the dev
        // server answers the SPA shell for unknown paths, so a "404" assertion could
        // never hold — and the browser's own message for a failed load names no URL,
        // so the location has to be carried from the message itself.
        return fetch('http://127.0.0.1:1/unreachable-probe').catch(() => undefined);
    });

    await expect
        .poll(() => portal.browserErrors.join('\n'), {timeout: 10_000})
        .toContain('[test] deliberate console error');
    await expect
        .poll(() => portal.browserErrors.join('\n'), {timeout: 10_000})
        .toContain('unreachable-probe');
});

test('a page that throws fails the test, and says why in the output', async ({portal}) => {
    test.fail(true, 'this spec must fail: it is the proof that a page error is reported');
    await portal.page.evaluate(() => {
        // Uncaught on purpose — a throw inside a timer is not caught by the caller,
        // which is what makes it a page error rather than a rejected evaluate.
        setTimeout(() => {
            throw new Error('[test] deliberate page error');
        }, 0);
    });

    // This wait aborts as soon as the page throws, rather than waiting out its
    // timeout: an uncaught exception means every element that follows is missing
    // for the same reason, and saying that once beats saying it once per element.
    await portal.waitForTableData();
});
