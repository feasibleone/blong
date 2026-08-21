/**
 * Self-registration flow — Playwright tests with screenshots.
 *
 * Starts unauthenticated (raw `page` fixture), opens the self-registration
 * form from the Login screen's Register button, fills it in and verifies the
 * auto-login lands in the portal.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';

test('self-registration: create account and auto-login', async ({page}) => {
    await page.goto('/');
    await expect(page.getByTestId('login-submit')).toBeVisible({timeout: 10000});

    // Open the registration form via the Register button (component/user.selfRegistration)
    await page.getByRole('button', {name: 'Register'}).click();
    await expect(page.getByTestId('register-submit')).toBeVisible();
    await expect(page).toHaveScreenshot('self-registration-form.png');

    // Fill the form with a unique email so tests are repeatable
    const email = `guest.play.${Date.now()}@example.com`;
    await page.getByLabel('First Name').fill('Playwright');
    await page.getByLabel('Last Name').fill('Guest');
    await page.getByLabel('Email Address').fill(email);
    await page.getByLabel('Password', {exact: true}).fill('testPassword');
    await page.getByLabel('Confirm Password', {exact: true}).fill('testPassword');
    await page.getByTestId('register-submit').click();

    // Auto-login lands in the portal
    await expect(page.locator('.blong-portal-menubar')).toBeVisible();
    await expect(page).toHaveScreenshot('self-registration-portal.png');
});

test('self-registration: password mismatch shows inline error', async ({page}) => {
    await page.goto('/');
    await page.getByRole('button', {name: 'Register'}).click();
    await expect(page.getByTestId('register-submit')).toBeVisible();

    await page.getByLabel('First Name').fill('Playwright');
    await page.getByLabel('Last Name').fill('Guest');
    await page.getByLabel('Email Address').fill(`guest.mismatch.${Date.now()}@example.com`);
    await page.getByLabel('Password', {exact: true}).fill('testPassword');
    await page.getByLabel('Confirm Password', {exact: true}).fill('different');
    await page.getByTestId('register-submit').click();

    await expect(page.getByText('Passwords do not match')).toBeVisible();
    await expect(page).toHaveScreenshot('self-registration-password-mismatch.png');
});
