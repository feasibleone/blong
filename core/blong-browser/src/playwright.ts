/**
 * Reusable Playwright fixtures for blong-browser applications.
 *
 * Provides a `portal` fixture that handles login automatically,
 * so individual .play.ts test files can focus on the actual test scenario.
 *
 * Usage in playwright.config.ts:
 * ```ts
 * import {defineConfig} from '@playwright/test';
 * export default defineConfig({...});
 * ```
 *
 * Usage in test files:
 * ```ts
 * import {test, expect} from '@feasibleone/blong-browser/playwright';
 * test('browse corals', async ({portal}) => {
 *     await portal.menuClick('marine.coral.browse');
 *     await expect(portal.page).toHaveScreenshot();
 * });
 * ```
 */
import {test as base, expect, type Page} from '@playwright/test';
import {coverageFixture} from './playwright/coverage.js';

export {expect};

/** Options configurable via playwright.config.ts `use` block or CLI. */
export interface IBlongTestOptions {
    /** Login username. */
    blongUsername: string;
    /** Login password. */
    blongPassword: string;
    /** Grant all permissions after login. Defaults to `false`; set to `true` in suites that need it. */
    blongPermissions: boolean;
}

/**
 * Portal helper — wraps common portal interactions
 * so tests read like user stories rather than CSS selector chains.
 */
export class Portal {
    readonly page: Page;
    constructor(page: Page) {
        this.page = page;
    }

    // ── Login ────────────────────────────────────────────────────────────────

    /** Log in via the Login form. Waits for the portal menubar to appear. */
    async login(username: string, password: string): Promise<void> {
        await this.page.fill('input[name="username"]', username);
        await this.page.fill('input[name="password"]', password);
        await this.page.getByTestId('login-submit').click();
        // Wait for portal to render (menubar appears)
        await this.page.locator('.blong-portal-menubar').waitFor({state: 'visible'});
    }

    // ── Menu ─────────────────────────────────────────────────────────────────

    /**
     * Click a portal menu item by its semantic triple.
     * For grouped menus, first opens the parent group.
     *
     * @param method - semantic triple, e.g. 'marine.coral.browse'
     */
    async menuClick(method: string): Promise<void> {
        const menuId = method.replace(/\./g, '-');
        const subject = method.split('.')[0]!;

        // Open the group menu first (hover to expand submenu)
        const group = this.page.getByTestId(`portal-menu-${subject}`);
        await group.click();

        // Click the specific menu item
        const item = this.page.getByTestId(`portal-menu-${menuId}`);
        await item.click();
    }

    // ── Tabs ─────────────────────────────────────────────────────────────────

    /** Close a tab. Finds the close button inside the tab header. */
    async tabClose(tabId: string): Promise<void> {
        await this.page.getByTestId(`portal-tab-close${tabId}`).click();
    }

    // ── Editor toolbar ───────────────────────────────────────────────────────

    /** Click the Save button and wait for the success icon. */
    async save(): Promise<void> {
        await this.page.getByTestId('editor-save').click();
        // Wait for the save icon to change to a check mark
        await this.page
            .locator('[data-testid="editor-save"] .pi-check')
            .waitFor({state: 'visible'});
    }

    /** Click the Edit button to enter edit mode. */
    async edit(): Promise<void> {
        await this.page.getByTestId('editor-edit').click();
    }

    /** Click the Reset/Cancel button. */
    async cancel(): Promise<void> {
        await this.page.getByTestId('editor-cancel').click();
    }

    /** Click the Refresh button. */
    async refresh(): Promise<void> {
        await this.page.getByTestId('editor-refresh').click();
    }

    // ── Form fields ──────────────────────────────────────────────────────────

    /**
     * Fill a text input by its field name.
     * Fields use `name` attributes like `coral.coralName`.
     */
    async fill(fieldName: string, value: string): Promise<void> {
        await this.page.fill(`input[name="${fieldName}"]`, value);
    }

    /** Fill a textarea by its field name. */
    async fillTextarea(fieldName: string, value: string): Promise<void> {
        await this.page.fill(`textarea[name="${fieldName}"]`, value);
    }

    // ── Table ────────────────────────────────────────────────────────────────

    /** Click a cell in a table. Uses data-testid pattern: `{fieldName}-{rowIndex}`. */
    async tableRowClick(fieldName: string, rowIndex: number): Promise<void> {
        await this.page.getByTestId(`${fieldName}-${rowIndex}`).click();
    }

    /**
     * Click a row that contains specific text in a table column.
     * Waits for the row to appear (useful after search/filter).
     */
    async tableRowClickByText(text: string): Promise<void> {
        await this.page.locator(`td:has-text("${text}")`).first().click();
    }

    /** Click the Add button on a table widget. */
    async tableAdd(fieldName: string): Promise<void> {
        await this.page.getByTestId(`${fieldName}-addButton`).click();
    }

    /** Click the Delete button on a table widget. */
    async tableDelete(fieldName: string): Promise<void> {
        await this.page.getByTestId(`${fieldName}-deleteButton`).click();
    }

    // ── Waiting ──────────────────────────────────────────────────────────────

    /** Wait for the form to finish loading (loading skeleton disappears). */
    async waitForFormLoad(): Promise<void> {
        await this.page.locator('.blong-editor').last().waitFor({state: 'visible'});
        // Wait for loading indicators to disappear
        await this.page
            .locator('.p-skeleton')
            .first()
            .waitFor({state: 'hidden'})
            .catch(() => {});
    }

    /**
     * Wait for form data to be populated from the API.
     * Use after `waitForFormLoad()` when opening an existing record,
     * to ensure the API response has been received before filling fields.
     */
    async waitForFormData(): Promise<void> {
        await this.page.waitForFunction(() => {
            const editors = document.querySelectorAll('.blong-editor');
            const last = editors[editors.length - 1];
            if (!last) return false;
            const inputs = last.querySelectorAll(
                'input:not([type="hidden"]):not([type="checkbox"])',
            );
            return Array.from(inputs).some(i => (i as HTMLInputElement).value !== '');
        });
    }

    /** Wait for the table data to load (rows appear). */
    async waitForTableData(): Promise<void> {
        await this.page.locator('.p-datatable-tbody tr').first().waitFor({state: 'visible'});
    }
}

/**
 * Playwright test fixture extended with blong portal and coverage support.
 *
 * The `portal` fixture automatically:
 * - Navigates to the app
 * - Logs in with configured credentials
 * - Provides a Portal helper for menu clicks, form fills, saves, etc.
 *
 * Browser-side JavaScript coverage is collected automatically when
 * `NODE_V8_COVERAGE` environment variable is set (by `blong-dev playwright --coverage`).
 * The coverage fixture runs silently and produces V8-format JSON files
 * compatible with `c8 report` aggregation.
 */
export const test = coverageFixture(
    base.extend<IBlongTestOptions & {portal: Portal}>({
        blongUsername: ['admin', {option: true}],
        blongPassword: ['admin', {option: true}],
        blongPermissions: [false, {option: true}],

        portal: async ({page, blongUsername, blongPassword, blongPermissions}, use) => {
            // Navigate to the app root — baseURL is set in playwright.config.ts
            await page.goto('/');

            const portal = new Portal(page);
            await portal.login(blongUsername, blongPassword);

            if (blongPermissions) {
                // Grant all permissions so permission-gated toolbar buttons are visible
                await page.evaluate(() => {
                    const store = (window as unknown as Record<string, unknown>).__blongStore as
                        | {getState: () => {setPermissions: (p: boolean) => void}}
                        | undefined;
                    store?.getState().setPermissions(true);
                });
            }

            // eslint-disable-next-line @eslint-react/rules-of-hooks -- Playwright fixture `use()`, not a React Hook
            await use(portal);
        },
    }),
);
