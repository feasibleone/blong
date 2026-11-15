/**
 * Self-service user profile — full personal-details path.
 *
 * The blong-party suite has BOTH blong-access and blong-party, so testAdmin is
 * linked (dbTest seed `partyTestProfileMerge`) to a `party.person` via the
 * `hasProfile` edge → the profile page shows personal details and the avatar
 * shows the name initials ("TA").
 *
 * Screenshots (baseline via `npm run playwright:update`, verify via
 * `npm run playwright`):
 *   - `profile-menu.png`     — the account menu open (avatar visible)
 *   - `profile-open.png`     — the profile tab loaded (personal details visible)
 *   - `profile-edit.png`     — name + email + language edited (dirty)
 *   - `profile-saved.png`    — saved with the success message
 *   - `profile-password.png` — the change-password form filled in
 *
 * The test restores the password (testPassword), the name, the email and the
 * language at the end so the shared dev DB stays stable.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import type {Page} from '@playwright/test';

test.use({blongPermissions: true});

/**
 * A 1×1 red PNG — enough for the store to call it a picture, for `sharp` to derive the thumbnail the
 * widget asks for, and small enough to sit in the spec.
 */
const TINY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
);

/** The rest of the profile, so a case can change the photograph and nothing else. */
const PERSONAL_DETAILS = {
    firstName: 'Test',
    lastName: 'Admin',
    emailAddress: 'testAdmin@example.com',
    preferredLanguage: 'en',
};

/** Set or clear the photograph without going through the form — the specs' own state control. */
async function storePhoto(page: Page, photoUrl: string | null): Promise<void> {
    await page.evaluate(
        async photo => {
            const handler = (window as unknown as {__blongHandler?: Record<string, unknown>})
                .__blongHandler;
            await (handler?.accessProfileEdit as (p: object, m: object) => Promise<unknown>)(
                {...photo.fields, photoUrl: photo.url},
                {},
            );
        },
        {fields: PERSONAL_DETAILS, url: photoUrl},
    );
}

/** The photograph the profile endpoint answers with, which is what the avatar draws. */
async function storedPhoto(page: Page): Promise<string | null> {
    return page.evaluate(async () => {
        const handler = (window as unknown as {__blongHandler?: Record<string, unknown>})
            .__blongHandler;
        const data = (await (
            handler?.accessProfileGet as (p: object, m: object) => Promise<unknown>
        )({}, {})) as {person?: {photoUrl?: string | null}};
        return data?.person?.photoUrl ?? null;
    });
}

/** Every record the store keeps in one namespace — the store's own answer, not the page's. */
async function blobRecords(
    page: Page,
    namespace: string,
): Promise<Array<{key: string; originalFilename?: string}>> {
    return page.evaluate(async ns => {
        const handler = (window as unknown as {__blongHandler?: Record<string, unknown>})
            .__blongHandler;
        const found = (await (handler?.blobBlobFind as (p: object, m: object) => Promise<unknown>)(
            {namespace: ns},
            {},
        )) as {blob?: Array<{key: string; originalFilename?: string}>};
        return found?.blob ?? [];
    }, namespace);
}

/** The avatar as a picture: an `<img>` whose bytes actually decoded. */
const avatarPicture = (page: Page) =>
    page.locator('.blong-account-menu__photo img.blong-blob-image');

test.describe('Party user profile', () => {
    test('shows personal details and allows editing the profile and password', async ({
        page,
        portal,
    }) => {
        test.setTimeout(120_000);

        // The portal fixture has logged in (as testAdmin) and rendered the menubar.
        await expect(portal.page.locator('.blong-portal-menubar')).toBeVisible();

        // Normalise the shared dev DB so screenshots are deterministic
        // regardless of leftover state from earlier runs.
        await page.evaluate(async () => {
            const handler = (window as unknown as {__blongHandler?: Record<string, unknown>})
                .__blongHandler;
            await (handler?.accessProfileEdit as (p: object, m: object) => Promise<unknown>)(
                {
                    emailAddress: 'testAdmin@example.com',
                    preferredLanguage: 'en',
                    firstName: 'Test',
                    lastName: 'Admin',
                },
                {},
            );
        });

        // The edit above reaches the database, not the page: the account menu rendered
        // before it and keeps the initials it was given, so the avatar has to be read from
        // a page that started after the edit. The leftover name is what a CI run showed —
        // the avatar read `TE` where this spec wants `TA`, was held for the full
        // expectation, and the *retry* passed because the call above had normalised the
        // row by then, which is the same state a reload produces here.
        await page.reload();
        await expect(portal.page.locator('.blong-portal-menubar')).toBeVisible();

        // The avatar shows the name initials (Test Admin → TA).
        const avatar = page.locator('.blong-account-menu__avatar');
        await expect(avatar).toBeVisible();
        await expect(avatar).toContainText('TA');

        // ── Open the account menu ───────────────────────────────────────────
        await avatar.click();
        const menu = page.locator('.blong-account-menu__menu');
        await expect(menu).toBeVisible();
        await expect(page).toHaveScreenshot('profile-menu.png');

        // ── Open the profile tab ────────────────────────────────────────────
        await menu.locator('.p-menuitem-link', {hasText: 'Profile'}).click();
        const profile = page.locator('.access-profile');
        await expect(profile).toBeVisible();
        const saveButton = profile.getByRole('button', {name: /save/i});
        await expect(saveButton).toBeEnabled();

        // Personal details from the linked party.person.
        await expect(profile.locator('input[name="firstName"]')).toHaveValue('Test');
        await expect(profile.locator('input[name="lastName"]')).toHaveValue('Admin');
        await expect(profile.locator('input[name="emailAddress"]')).toHaveValue(
            'testAdmin@example.com',
        );
        await expect(profile.getByText('Admin', {exact: true})).toBeVisible();
        await expect(page).toHaveScreenshot('profile-open.png');

        // ── Edit name + email + language, save ──────────────────────────────
        await profile.locator('input[name="firstName"]').fill('Test Edit');
        await profile.locator('input[name="lastName"]').fill('Admin Edited');
        await profile.locator('input[name="emailAddress"]').fill('profile@example.com');
        await profile.locator('.p-dropdown').click();
        await page.locator('.p-dropdown-panel .p-dropdown-item', {hasText: 'Български'}).click();
        await expect(page).toHaveScreenshot('profile-edit.png');

        await saveButton.click();
        await expect(profile.locator('.p-inline-message-success')).toBeVisible();
        await expect(page).toHaveScreenshot('profile-saved.png');

        // ── Change password (keep current session) ──────────────────────────
        const passwordCard = profile.locator('.p-card', {hasText: 'Change Password'});
        await passwordCard.locator('input[name="currentPassword"]').fill('testPassword');
        await passwordCard.locator('input[name="newPassword"]').fill('NewPass123!');
        await passwordCard.locator('input[name="confirmPassword"]').fill('NewPass123!');
        await expect(page).toHaveScreenshot('profile-password.png');

        await passwordCard.getByRole('button', {name: /change password/i}).click();
        await expect(passwordCard.locator('.p-inline-message-success')).toBeVisible();

        // ── Restore the original password ───────────────────────────────────
        await passwordCard.locator('input[name="currentPassword"]').fill('NewPass123!');
        await passwordCard.locator('input[name="newPassword"]').fill('testPassword');
        await passwordCard.locator('input[name="confirmPassword"]').fill('testPassword');
        await passwordCard.getByRole('button', {name: /change password/i}).click();
        await expect(passwordCard.locator('.p-inline-message-success')).toBeVisible();
        await expect(passwordCard.locator('.p-inline-message-error')).toHaveCount(0);

        // ── Restore name + email + language ─────────────────────────────────
        await profile.locator('input[name="firstName"]').fill('Test');
        await profile.locator('input[name="lastName"]').fill('Admin');
        await profile.locator('input[name="emailAddress"]').fill('testAdmin@example.com');
        await profile.locator('.p-dropdown').click();
        await page.locator('.p-dropdown-panel .p-dropdown-item', {hasText: 'English'}).click();
        await saveButton.click();
        await expect(profile.locator('.p-inline-message-success')).toBeVisible();
        await expect(profile.locator('.p-inline-message-error')).toHaveCount(0);

        // Sanity — the restored password still logs in.
        const loginCheck = await page.evaluate(async () => {
            const handler = (window as unknown as {__blongHandler?: Record<string, unknown>})
                .__blongHandler;
            try {
                const result = (await (
                    handler?.loginTokenCreate as (
                        p: object,
                        m: object,
                    ) => Promise<{access_token: string}>
                )({username: 'testAdmin', password: 'testPassword'}, {})) as {
                    access_token?: string;
                };
                return Boolean(result?.access_token);
            } catch {
                return false;
            }
        });
        expect(loginCheck, 'testPassword still logs testAdmin in').toBe(true);
    });

    /**
     * The photograph: chosen through the widget, saved with the form, drawn on the account menu.
     *
     * The record keeps a `blob://` reference rather than a copy of the bytes, so what is asserted is the
     * whole path — the three calls the widget makes, the reference the person row ends up holding, and
     * the avatar reading those bytes back out of the store.
     */
    test('stores a photograph and shows it on the avatar', async ({page, portal}) => {
        test.setTimeout(120_000);

        await expect(portal.page.locator('.blong-portal-menubar')).toBeVisible();
        await storePhoto(page, null);
        await page.reload();
        await expect(portal.page.locator('.blong-portal-menubar')).toBeVisible();
        await expect(page.locator('.blong-account-menu__avatar')).toContainText('TA');

        // ── Open the profile tab ────────────────────────────────────────────
        await page.locator('.blong-account-menu__avatar').click();
        await page
            .locator('.blong-account-menu__menu .p-menuitem-link', {hasText: 'Profile'})
            .click();
        const profile = page.locator('.access-profile');
        await expect(profile).toBeVisible();

        // ── Choose the picture through the widget ───────────────────────────
        // The input is hidden behind the FileUpload button; setting the files is what a person's
        // own choice does, and it is the only step a test can take for them.
        const photo = profile.locator('[data-testid="access-profile-photo"]');
        await photo.locator('input[type="file"]').setInputFiles({
            name: 'avatar.png',
            mimeType: 'image/png',
            buffer: TINY_PNG,
        });
        // The commit answers the reference, and the widget then holds a value instead of a picker.
        await expect(photo.locator('.blong-asset__current')).toBeVisible({timeout: 60_000});
        await expect(page).toHaveScreenshot('profile-photo-picked.png');

        // ── Save it with the form ───────────────────────────────────────────
        await profile.getByRole('button', {name: /save/i}).click();
        await expect(profile.locator('.p-inline-message-success')).toBeVisible();
        await expect(profile.locator('.p-inline-message-error')).toHaveCount(0);

        // The person row holds a reference, not bytes and not an external URL.
        await expect
            .poll(async () => storedPhoto(page), {timeout: 30_000})
            .toMatch(/^blob:\/\/party\//);

        // The menubar avatar redraws from the saved profile: a picture, decoded.
        const picture = avatarPicture(page);
        await expect(picture).toBeVisible({timeout: 30_000});
        await expect
            .poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth), {
                timeout: 30_000,
            })
            .toBeGreaterThan(0);
        await expect(page).toHaveScreenshot('profile-photo-saved.png');

        // A page that starts after the save draws it too — the reference is persisted, not carried.
        await page.reload();
        await expect(portal.page.locator('.blong-portal-menubar')).toBeVisible();
        await expect(avatarPicture(page)).toBeVisible({timeout: 30_000});

        // ── Restore: no photograph, initials again ──────────────────────────
        await storePhoto(page, null);
        await page.reload();
        await expect(portal.page.locator('.blong-portal-menubar')).toBeVisible();
        await expect(page.locator('.blong-account-menu__avatar')).toContainText('TA');
        await expect(avatarPicture(page)).toHaveCount(0);
        expect(await storedPhoto(page), 'the person row holds no photograph again').toBeNull();
    });

    /**
     * The store's refusal is the whole promise of the allow-list: a file the store will not keep must
     * leave nothing behind — no record, no reserved key, no photograph on the person.
     *
     * A `.png` declared `image/jpeg` is the cheapest refusal to reach from a browser: the extension is
     * known, the type is a real one, and the pair is not a pair (`blob.contentTypeMismatch`).
     */
    test('refuses a file the store will not keep, and leaves nothing behind', async ({
        page,
        portal,
    }) => {
        test.setTimeout(120_000);

        await expect(portal.page.locator('.blong-portal-menubar')).toBeVisible();
        await storePhoto(page, null);
        await page.reload();
        await expect(portal.page.locator('.blong-portal-menubar')).toBeVisible();

        await page.locator('.blong-account-menu__avatar').click();
        await page
            .locator('.blong-account-menu__menu .p-menuitem-link', {hasText: 'Profile'})
            .click();
        const profile = page.locator('.access-profile');
        await expect(profile).toBeVisible();

        const photo = profile.locator('[data-testid="access-profile-photo"]');
        await photo.locator('input[type="file"]').setInputFiles({
            name: 'refused.png',
            mimeType: 'image/jpeg',
            buffer: TINY_PNG,
        });

        // The widget says so where the person is looking, and keeps no value.
        await expect(photo.locator('.blong-asset__failure')).toBeVisible({timeout: 30_000});
        await expect(photo.locator('.blong-asset__current')).toHaveCount(0);

        // Nothing reached the store under that name.
        const kept = await blobRecords(page, 'party');
        expect(kept.map(record => record.originalFilename)).not.toContain('refused.png');

        // And the person still has no photograph.
        expect(await storedPhoto(page)).toBeNull();
    });
});
