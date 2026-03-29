/**
 * Basic smoke test for the ui-demo reference application.
 *
 * Uses data-testid and input[name] as stable locators.
 */

import {test, expect} from '@playwright/test';

test.describe('UI Demo Reference Application', () => {
    test('login page renders', async ({page}) => {
        await page.goto('/login');
        await expect(page.locator('h2')).toContainText('Sign In');
        await expect(page.locator('input[name="username"]')).toBeVisible();
        await expect(page.locator('input[name="password"]')).toBeVisible();
    });

    test('login form validation', async ({page}) => {
        await page.goto('/login');
        await page.click('button[type="submit"]');
        // Expect validation errors
        await expect(page.locator('.blong-field-error')).toHaveCount(2);
    });

    test('redirects to login when unauthenticated', async ({page}) => {
        await page.goto('/');
        await expect(page).toHaveURL(/\/login/);
    });
});
