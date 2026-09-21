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

export {expect, Page};

/**
 * Default timeout (ms) for element-level waits in the Portal helpers.
 *
 * Kept deliberately short (3-5s) so a genuinely missing element fails fast
 * instead of hanging on the default ~30s test timeout. Test/global timeouts
 * stay generous because network + dev-server compile can still be slow.
 *
 * Override with the `BLONG_ELEMENT_TIMEOUT` env var to iterate faster: a page
 * that fails to render then costs seconds per element instead of minutes.
 */
export const BLONG_ELEMENT_TIMEOUT = Number(process.env['BLONG_ELEMENT_TIMEOUT']) || 5_000;

/**
 * Timeout (ms) for the app's **first** element after a navigation.
 *
 * The element budget above covers elements inside an application that is already
 * running. The login form is not one of them: the dev server serves the module graph
 * one file per request, so the app starts executing seconds after `page.goto()` has
 * resolved with `load`. Measured in CI, the app's first boot log appears 3-4.5s after
 * the document loaded and the form is in the DOM ~6s in, and the page is blank until
 * then — with several suites booting in parallel on a cold runner it is slower still.
 *
 * Bounding that wait by `BLONG_ELEMENT_TIMEOUT` is not "failing fast on a missing
 * element", it is racing the server: the fill is given its whole budget while there is
 * no form to fill, and a run where everything renders correctly is reported as
 * `page.fill: Timeout 5000ms exceeded`.
 *
 * 15s is roughly 2.5x the slowest boot measured in CI (F-223), and stays inside the
 * tightest test budget in the repository: `core/blong-realm` runs 20s smoke checks, and
 * a boot wait longer than the test it belongs to would be cut off by the test timeout
 * instead of reporting itself (D-246). Override with `BLONG_BOOT_TIMEOUT` to iterate
 * faster.
 */
export const BLONG_BOOT_TIMEOUT = Number(process.env['BLONG_BOOT_TIMEOUT']) || 15_000;

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

    /**
     * Everything the browser said during the session — console errors and warnings,
     * and uncaught exceptions.
     *
     * Collected, not just printed: a broken page is otherwise reported as whichever
     * element never appeared, and the reason stays in a trace nobody opens.
     */
    readonly browserErrors: string[] = [];

    /** The first uncaught exception, if the page threw — the app is dead after it. */
    fatalError: Error | undefined;

    /** Rejects as soon as the page throws, so no wait outlives the application. */
    readonly #fatalWait: Promise<never>;
    #rejectFatal!: (error: Error) => void;

    constructor(page: Page) {
        this.page = page;
        this.#fatalWait = new Promise<never>((_resolve, reject) => {
            this.#rejectFatal = reject;
        });
        // Recorded whether or not anyone is waiting on it; this keeps the rejection
        // from surfacing as an unhandled one when no wait is in flight.
        this.#fatalWait.catch(() => undefined);

        page.on('console', message => {
            if (message.type() !== 'error' && message.type() !== 'warning') return;
            // Where it came from: a browser message like "Failed to load resource:
            // 404" names no URL in its text, and the URL is the whole answer.
            const {url, lineNumber} = message.location();
            const where = url === undefined ? '' : ` (${url}:${lineNumber})`;
            this.#note(`${message.type()}: ${message.text()}${where}`);
        });
        page.on('pageerror', error => {
            this.#note(`pageerror: ${error.message}`);
            this.fatalError ??= error;
            this.#rejectFatal(error);
        });
    }

    /** Record a browser message and echo it, so it is visible while the run goes on. */
    #note(line: string): void {
        this.browserErrors.push(line);
        console.error(`[browser] ${line}`);
    }

    /** A failure carrying everything the browser said — never a bare timeout. */
    failure(reason: unknown): Error {
        const base = reason instanceof Error ? reason : new Error(String(reason));
        if (this.browserErrors.length === 0) return base;
        return new Error(
            `${base.message}\n[browser errors]\n${this.browserErrors
                .map(line => `  ${line}`)
                .join('\n')}`,
            {cause: base},
        );
    }

    /**
     * Run an action, giving up the moment the page throws.
     *
     * An uncaught exception means the bundle is dead: every element that follows is
     * missing for a reason, and waiting an element timeout for each of them buries
     * the cause behind a slow failure instead of naming it.
     */
    async #guard<T>(action: Promise<T>): Promise<T> {
        if (this.fatalError !== undefined) throw this.failure(this.fatalError);
        // The race abandons the action, so its own rejection must not go unhandled.
        action.catch(() => undefined);
        try {
            return await Promise.race([action, this.#fatalWait]);
        } catch (reason) {
            throw this.failure(this.fatalError ?? reason);
        }
    }

    // ── Login ──────────────────────────────────────────────────────────────

    /** Log in via the Login form. Waits for the portal menubar to appear. */
    async login(username: string, password: string): Promise<void> {
        // The login form is the app's first paint, so it is the one element waited for
        // with the boot budget rather than the element budget — see
        // {@link BLONG_BOOT_TIMEOUT}. Waiting for it here and filling it below keeps the
        // two questions apart: "is the app up?" is the server's pace, "can this field be
        // filled?" is the element budget, and one budget cannot answer both.
        await this.#guard(
            this.page
                .locator('input[name="username"]')
                .waitFor({state: 'visible', timeout: BLONG_BOOT_TIMEOUT}),
        );
        const timeout = BLONG_ELEMENT_TIMEOUT;
        await this.#guard(this.page.fill('input[name="username"]', username, {timeout}));
        await this.#guard(this.page.fill('input[name="password"]', password, {timeout}));
        await this.#guard(this.page.getByTestId('login-submit').click({timeout}));
        // Wait for portal to render (menubar appears)
        await this.#guard(
            this.page
                .locator('.blong-portal-menubar')
                .waitFor({state: 'visible', timeout: BLONG_ELEMENT_TIMEOUT}),
        );
        // The menubar appears from the suite's own configuration; the composed one —
        // every page-owning realm's menu, and the brand it may set — is applied a
        // moment later (App.tsx calls `portalConfigMerge` once authenticated). A
        // capture taken in between shows a portal that is only half-composed, so
        // every spec waits for the shell to say the composed answer landed.
        await this.#guard(
            this.page
                .locator('html[data-portal-config="merged"]')
                .waitFor({state: 'attached', timeout: BLONG_ELEMENT_TIMEOUT}),
        );
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
        await this.#guard(group.click());

        // Click the specific menu item
        const item = this.page.getByTestId(`portal-menu-${menuId}`);
        await this.#guard(item.click({timeout: BLONG_ELEMENT_TIMEOUT}));
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
            .waitFor({state: 'visible', timeout: BLONG_ELEMENT_TIMEOUT});
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
        await this.#guard(
            this.page
                .locator('.blong-editor')
                .last()
                .waitFor({state: 'visible', timeout: BLONG_ELEMENT_TIMEOUT}),
        );
        // Wait for loading indicators to disappear
        await this.page
            .locator('.p-skeleton')
            .first()
            .waitFor({state: 'hidden', timeout: BLONG_ELEMENT_TIMEOUT})
            .catch(() => {});
    }

    /**
     * Wait for form data to be populated from the API.
     * Use after `waitForFormLoad()` when opening an existing record,
     * to ensure the API response has been received before filling fields.
     */
    async waitForFormData(): Promise<void> {
        await this.#guard(
            this.page.waitForFunction(
                () => {
                    const editors = document.querySelectorAll('.blong-editor');
                    const last = editors[editors.length - 1];
                    if (!last) return false;
                    const inputs = last.querySelectorAll(
                        'input:not([type="hidden"]):not([type="checkbox"])',
                    );
                    return Array.from(inputs).some(i => (i as HTMLInputElement).value !== '');
                },
                {timeout: BLONG_ELEMENT_TIMEOUT},
            ),
        );
    }

    /** Wait for the table data to load (rows appear after loading completes). */
    async waitForTableData(): Promise<void> {
        // PrimeReact DataTable renders an empty state row synchronously
        // before the API response arrives.  Waiting for ANY <tr> would resolve
        // on that empty row before data has loaded.  Instead, wait for the
        // loading overlay to disappear first.
        await this.page
            .locator('.p-datatable-loading-overlay')
            .waitFor({state: 'hidden', timeout: BLONG_ELEMENT_TIMEOUT})
            .catch(() => {});
        await this.#guard(
            this.page
                // Either a data row or the table's explicit empty state. A page whose
                // answer is legitimately empty — a search before it is typed, a filter
                // that matches nothing — is loaded, and must not be mistaken for a page
                // that never rendered (which is what the fixtures now report anyway).
                //
                // `:visible` because the portal keeps every opened page mounted
                // (`renderActiveOnly={false}`): the tables of inactive tabs are still
                // in the DOM, and without this a spec that opens a second page waits
                // on the first page's hidden row.
                .locator('.p-datatable-tbody tr:visible, .p-datatable-emptymessage:visible')
                .first()
                .waitFor({state: 'visible', timeout: BLONG_ELEMENT_TIMEOUT}),
        );
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
            // Constructed before navigating so the boot itself is watched: a page that
            // throws while it loads is exactly the case this fixture exists to report.
            // `Portal` echoes browser console errors/warnings to the runner's stderr
            // (prefixed `[browser]`) and gives up a wait the moment the page throws,
            // instead of letting every later element wait out its full timeout.
            const portal = new Portal(page);

            // Navigate to the app root. Relative (`./`), not `/`: the dev server serves
            // the app under the framework base path (`/s/`, see `defineBlongViteConfig`),
            // and an origin-absolute `/` would resolve past it to a 404 page.
            await page.goto('./');

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

            // An uncaught exception is a broken application, whether or not the
            // assertion that followed happened to pass. Reporting it here means the
            // suite never goes green over a page that threw.
            if (portal.fatalError !== undefined) throw portal.failure(portal.fatalError);
        },
    }),
);
