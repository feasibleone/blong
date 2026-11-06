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
import {writePendingReport} from './playwright/translate.js';

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

/**
 * How long a menu click waits for the submenu it just opened to render.
 *
 * A group in the menubar is a toggle whose popup is a React state change, so the
 * next clickable item is in the DOM a frame later — not at once, and not late
 * enough to deserve the element budget. Bounding the wait keeps a closed chain a
 * cheap retry instead of a five-second hang on an element that never appears.
 */
const MENU_SETTLE_TIMEOUT = 750;

/** Options configurable via playwright.config.ts `use` block or CLI. */
export interface IBlongTestOptions {
    /** Login username. */
    blongUsername: string;
    /** Login password. */
    blongPassword: string;
    /** Grant all permissions after login. Defaults to `false`; set to `true` in suites that need it. */
    blongPermissions: boolean;
    /**
     * Browser messages this spec provokes on purpose, so the run does not print them.
     *
     * A spec that asserts a refusal (a role without the capability) or exercises the
     * renewal path (a revoked session) knows which lines the browser will report;
     * declaring them here keeps the evidence — the message is still collected in
     * `Portal.browserErrors` and still attached to a failure — while leaving it out of
     * the run's log, which is otherwise a wall of lines every reader learns to skip.
     *
     * **Substrings, not regular expressions.** A fixture option crosses Playwright's
     * worker boundary and arrives as plain JSON, where a `RegExp` is an empty object —
     * `patterns.some is not a function`, thrown the first time the page said anything.
     * The line a pattern is matched against is the whole note, URL and line number
     * included, so `'rpc/blong/flow/find'` finds a message whose own text names no URL.
     *
     * Hooked to the spec rather than to the message: "this spec expects this" is a
     * statement the author makes and a reviewer can check, where a global ignore list
     * would hide the same line in the spec that does *not* expect it.
     */
    blongExpectedBrowserErrors?: readonly string[];
    /**
     * UI language the run activates after login.
     *
     * The switch goes through `languageActivate`, so the database dictionary for
     * that language is read before the first assertion — a spec then sees a
     * translated page, not one that was still English when it captured.
     */
    blongLanguage?: string;
    /**
     * Opt in to translation harvesting: the seed files a run may add its missing
     * keys to. Unset means collection is off and nothing is written.
     *
     * A test never writes a seed; it writes one pending report, and the run's
     * `globalTeardown` merges them under a lock (`D-632`).
     */
    blongTranslationSeed?: {
        language?: string;
        /** Label seed, e.g. `meta/db/bg-coreLabelSeed.yaml`. */
        label?: string;
        /** Resource seed, e.g. `meta/db/bg-coreTranslationSeed.yaml`. */
        translation?: string;
    };
}

/** How a spec declares the browser messages it provokes on purpose. */
export interface IPortalOptions {
    /** Messages not to echo; recorded and reported exactly as the others are. */
    expected?: readonly string[];
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

    /** Messages not to echo, from the spec that knows it caused them. */
    readonly #expected: readonly string[];

    /** Rejects as soon as the page throws, so no wait outlives the application. */
    readonly #fatalWait: Promise<never>;
    #rejectFatal!: (error: Error) => void;

    constructor(page: Page, options: IPortalOptions = {}) {
        this.page = page;
        this.#expected = options.expected ?? [];
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

    /**
     * Record a browser message, and echo it unless the spec declared it expected.
     *
     * The echo is what makes a broken page visible while the run goes on, so it stays
     * the default: silence is what a spec asks for, per message.
     */
    #note(line: string): void {
        this.browserErrors.push(line);
        if (this.#expected.some(pattern => line.includes(pattern))) return;
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
     * The group a page sits in is the model's own decision (`classifier`,
     * `menu.group`, `menu.root` — `@@D-777`), so it is read from the composed
     * menu rather than guessed from the method's subject: a page whose subject is
     * `sport` may be under `Registry` or inside the shared
     * `Classifiers` root, and clicking `portal-menu-sport` would open the wrong
     * submenu and then wait on a leaf that is not rendered.
     *
     * @param method - semantic triple, e.g. 'marine.coral.browse'
     */
    async menuClick(method: string): Promise<void> {
        const menuId = method.replace(/\./g, '-');
        // The groups that contain the page, outermost first. A menu without a
        // test hook (or a page it does not carry) falls back to the subject group,
        // which is what a flat, single-group menu needs.
        const path = await this.#menuPath(method);
        const groups = path.length ? path : [method.split('.')[0]!];
        const item = this.page.getByTestId(`portal-menu-${menuId}`);

        // Opening a group is a toggle and the submenu it opens renders a moment
        // later, so a group click that lands while the previous submenu is still
        // settling can leave the chain closed — the leaf is then in the DOM but
        // hidden, and the click below waits out its timeout on an element no
        // amount of waiting can reveal. Walk the chain again until the leaf is
        // actually visible, which is also what reopens a group that a click closed.
        for (let attempt = 0; attempt < 3; attempt++) {
            if (await item.isVisible().catch(() => false)) break;
            for (const [index, groupId] of groups.entries()) {
                const group = this.page.getByTestId(`portal-menu-${groupId}`).first();
                if (!(await group.count())) continue;
                if (!(await group.isVisible().catch(() => false))) continue;
                await this.#guard(group.click());
                // The click only requests the submenu: the next target — the group
                // below this one, or the leaf itself — appears a frame or two later,
                // and clicking before it does is what leaves the chain half open.
                const next =
                    index + 1 < groups.length
                        ? this.page.getByTestId(`portal-menu-${groups[index + 1]}`).first()
                        : item;
                await next
                    .waitFor({state: 'visible', timeout: MENU_SETTLE_TIMEOUT})
                    .catch(() => undefined);
            }
        }

        // Click the specific menu item
        await this.#guard(item.click({timeout: BLONG_ELEMENT_TIMEOUT}));
    }

    /**
     * The ids of the groups holding `method`, outermost first.
     *
     * Read from the composed portal config (`portal.portalConfig.menu`) through the
     * integration test hook. An empty answer means the store or the menu is not
     * reachable from this deployment, and the caller falls back.
     */
    async #menuPath(method: string): Promise<string[]> {
        return this.page.evaluate(target => {
            const store = (globalThis as {__blongStore?: {getState?: () => unknown}}).__blongStore;
            const state = store?.getState?.() as
                | {portal?: {portalConfig?: {menu?: unknown[]}}}
                | undefined;
            const menu = state?.portal?.portalConfig?.menu;
            if (!Array.isArray(menu)) return [];
            type Node = {id?: string; method?: string; items?: Node[]} | string;
            const walk = (items: Node[], ancestors: string[]): string[] | undefined => {
                for (const item of items) {
                    if (typeof item === 'string') {
                        if (item === target) return ancestors;
                        continue;
                    }
                    if (Array.isArray(item.items)) {
                        const found = walk(item.items, [...ancestors, item.id ?? '']);
                        if (found) return found;
                    }
                    if (item.method === target) return ancestors;
                }
                return undefined;
            };
            return (walk(menu as Node[], []) ?? []).filter(Boolean);
        }, method);
    }

    // ── Tabs ─────────────────────────────────────────────────────────────────

    /** Close a tab. Finds the close button inside the tab header. */
    async tabClose(tabId: string): Promise<void> {
        await this.page.getByTestId(`portal-tab-close${tabId}`).click();
    }

    /**
     * Close every open tab, back to the empty portal.
     *
     * The portal keeps closed-page state out of the shell but not out of the tab strip: a
     * page opened while two tabs are standing is a different picture from one opened on an
     * empty portal, and a test that visits several pages in a row must therefore pass
     * through empty between them or every capture after the first moves (`@@D-748`).
     */
    async tabsCloseAll(): Promise<void> {
        const closeButtons = this.page.locator('.blong-tab-close');
        for (let remaining = await closeButtons.count(); remaining > 0; remaining -= 1) {
            await this.#guard(closeButtons.last().click({timeout: BLONG_ELEMENT_TIMEOUT}));
            await this.page
                .locator('.blong-tab-close')
                .nth(remaining - 1)
                .waitFor({state: 'detached', timeout: BLONG_ELEMENT_TIMEOUT})
                .catch(() => undefined);
        }
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

/** What a session needs to become an authenticated portal. */
export interface ISignInOptions {
    /** Login name. */
    username: string;
    /** Login password. */
    password: string;
    /** Grant every permission after login, so permission-gated controls are visible. */
    permissions?: boolean;
    /** UI language to activate, which awaits the database dictionary. */
    language?: string;
}

/**
 * Open the app and sign in, returning the helper a spec drives.
 *
 * The sequence is the same whether the page is this test's own or one a whole worker
 * shares, so it lives here rather than inside the fixture: a shared session
 * (`./playwright/shared.js`) boots once per worker and must sign in exactly the way a
 * per-test boot does, or a spec would measure a different app depending on which
 * fixture it imported.
 */
export async function openPortal(
    page: Page,
    options: ISignInOptions,
    existing?: Portal,
): Promise<Portal> {
    const {username, password, permissions = false, language} = options;
    // A caller that already built the helper keeps it — the `portal` fixture constructs
    // one before navigating so that a page which throws *while booting* is reported, and
    // two helpers watching one page would report every console line twice.
    const portal = existing ?? new Portal(page, {expected: []});

    // Navigate to the app root. Relative (`./`), not `/`: the dev server serves the app
    // under the framework base path (`/s/`, see `defineBlongViteConfig`), and an
    // origin-absolute `/` would resolve past it to a 404 page.
    await page.goto('./');
    await portal.login(username, password);

    if (permissions) {
        // Grant all permissions so permission-gated toolbar buttons are visible
        await page.evaluate(() => {
            const store = (window as unknown as Record<string, unknown>).__blongStore as
                | {getState: () => {setPermissions: (p: boolean) => void}}
                | undefined;
            store?.getState().setPermissions(true);
        });
    }

    if (language) {
        // The same store the permission escape uses, and only exposed by a test intent.
        // Activation awaits the database dictionary, so a spec asserts on a page that is
        // already translated.
        await page.evaluate(async value => {
            const win = window as unknown as {
                __blongI18n?: {activate?: (value: string) => Promise<void>};
                __blongStore?: {
                    getState: () => {languageActivate?: (value: string) => Promise<void>};
                };
            };
            // `activate` is the app's own hook (it awaits the database dictionary); the
            // store form is the fallback for a portal that exposes `testHook`.
            if (win.__blongI18n?.activate) await win.__blongI18n.activate(value);
            else await win.__blongStore?.getState().languageActivate?.(value);
        }, language);
        await page.waitForSelector(`html[data-language="${language}"]`, {
            state: 'attached',
            timeout: BLONG_ELEMENT_TIMEOUT,
        });
    }

    return portal;
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
        blongExpectedBrowserErrors: [[], {option: true}],
        blongLanguage: [undefined as string | undefined, {option: true}],
        blongTranslationSeed: [
            undefined as IBlongTestOptions['blongTranslationSeed'],
            {option: true},
        ],

        portal: async (
            {
                page,
                blongUsername,
                blongPassword,
                blongPermissions,
                blongExpectedBrowserErrors,
                blongLanguage,
                blongTranslationSeed,
            },
            use,
        ) => {
            // Constructed before navigating so the boot itself is watched: a page that
            // throws while it loads is exactly the case this fixture exists to report.
            // `Portal` echoes browser console errors/warnings to the runner's stderr
            // (prefixed `[browser]`) and gives up a wait the moment the page throws,
            // instead of letting every later element wait out its full timeout.
            const portal = new Portal(page, {expected: blongExpectedBrowserErrors});

            // Collection starts before the app boots, so the first authenticated
            // render is recorded rather than only the screens a spec reopens.
            if (blongTranslationSeed) {
                await page.addInitScript(() => {
                    (window as unknown as {__blongI18nCollect?: boolean}).__blongI18nCollect = true;
                });
            }

            // The boot and the sign-in, exactly as a shared session does them: the
            // fixture is the portal object plus the per-test bookkeeping around it.
            await openPortal(
                page,
                {
                    username: blongUsername,
                    password: blongPassword,
                    permissions: blongPermissions,
                    language: blongLanguage,
                },
                portal,
            );

            // eslint-disable-next-line @eslint-react/rules-of-hooks -- Playwright fixture `use()`, not a React Hook
            await use(portal);

            if (blongTranslationSeed) {
                const report = await page.evaluate(() => {
                    const api = (
                        window as unknown as {
                            __blongI18n?: {report?: () => unknown};
                        }
                    ).__blongI18n;
                    return api?.report?.() as
                        | {language?: string; missing?: string[]; missingResources?: string[]}
                        | undefined;
                });
                if (report) writePendingReport(blongTranslationSeed, report);
            }

            // An uncaught exception is a broken application, whether or not the
            // assertion that followed happened to pass. Reporting it here means the
            // suite never goes green over a page that threw.
            if (portal.fatalError !== undefined) throw portal.failure(portal.fatalError);
        },
    }),
);
