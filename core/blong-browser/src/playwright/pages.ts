/**
 * Page smoke helpers for blong portal applications.
 *
 * `model.ts` covers what a model page *does* — browse, create, edit. This covers
 * whether a realm's pages open at all: under a real session, with a real gateway
 * behind them, and a screenshot to prove it. Both are the same kind of helper, so
 * a realm's UI spec is a list of pages instead of a hand-rolled test per page.
 *
 * Usage:
 * ```ts
 * import {test, expect} from '@feasibleone/blong-browser/playwright';
 * import {openPages} from '@feasibleone/blong-browser/playwright/pages';
 *
 * openPages(test, expect, {
 *     methods: ['blong.flow.browse', {method: 'blong.search.browse', waitForTableData: false}],
 *     screenshot: method => `${method.split('.')[1]}.png`,
 * });
 * ```
 *
 * A page that renders an error panel, that never leaves its loading state, or
 * whose realm was never mounted looks exactly like a page with no data — which is
 * why this waits for the page's table before capturing, and why the `portal`
 * fixture fails a test outright when the browser throws while the page loads.
 */
import type {Expect, Page, Request, Response} from '@playwright/test';
import {captureDocs} from './docs.js';
import type {ITestFn} from './model.js';

/** How long a debounced search has to turn into a read before it is judged local. */
const SEARCH_PROBE_MS = 600;
/** A read the search did issue is given this long to be answered. */
const FILTERED_READ_MS = 15_000;
/** Stride of the poll that waits out a debounce. */
const POLL_MS = 50;

/** One page: its method, or the method plus the parts that differ for it. */
export interface IOpenPage {
    /** The portal menu method — a semantic triple, e.g. `blong.flow.browse`. */
    method: string;
    /** Baseline name for this page, overriding the default. */
    screenshot?: string;
    /** Wait for this page's table. Defaults to the spec-wide `waitForTableData`. */
    waitForTableData?: boolean;
    /**
     * Text typed into the page's filter (`browse-search`) before capturing.
     *
     * A page whose content grows with every run — a change stream, a list of what
     * has been observed so far — is only stable once its rows are pinned to a
     * stable subset. The same idea as `browseModel`'s `searchText`.
     */
    searchText?: string;
    /**
     * Locators masked in the capture, for a cell whose value cannot repeat: an id
     * minted per execution, a wall clock. Masking is honest here and pinning is
     * not — the cell shows something, it just cannot be the same something twice.
     */
    mask?: readonly string[];
    /**
     * Capture this element instead of the whole page.
     *
     * Filtering pins *which* rows a table shows; it does not pin *how many*, and a
     * stream that grows during a run (a change digest) therefore cannot be captured
     * whole. Capturing the first row is exact — the row is the newest one of its
     * kind, and its content is what the page is for.
     */
    region?: string;
    /** Documentation image for this page, relative to the docs tree. Overrides {@link IOpenPagesOptions.docs}. */
    docs?: string;
}

export interface IOpenPagesOptions {
    /** The pages to open, in order. A bare string takes every default. */
    methods: readonly (string | IOpenPage)[];
    /** Baseline name for a method. Defaults to the triple with dots replaced by dashes. */
    screenshot?: (method: string) => string;
    /** Wait for each page's table to render. Defaults to `true`. */
    waitForTableData?: boolean;
    /** Filter text typed into every page. Defaults to none. */
    searchText?: string;
    /** Prefix every baseline, to keep two specs off the same screenshot files. */
    baselinePrefix?: string;
    /**
     * Also write a documentation image for a page, named relative to the docs tree —
     * `patterns/img/access-role-browse.png`, say. The page is captured with the same
     * `searchText`, `mask` and `region` the baseline uses, so the picture is pinned by the
     * settings a reader can see rather than by a second set that could drift from them.
     *
     * The image is written only when `BLONG_CAPTURE_DOCS=1` (see
     * {@link captureDocs}), so a CI run checks the page without overwriting a committed
     * picture.
     */
    docs?: (method: string) => string | undefined;
    /**
     * Write only the documentation images: skip the baseline comparison entirely.
     *
     * For a spec whose pages exist to be photographed rather than to be guarded — a realm
     * showing a feature the docs describe, where a new baseline would be a snapshot nobody
     * asked to maintain. Requires {@link IOpenPagesOptions.docs}.
     */
    docsOnly?: boolean;
}

/**
 * Fill the browse filter and wait for the table to show the filtered rows.
 *
 * Typing into the box is not filtering: the box is debounced (350 ms), and only
 * then does the table apply the term — either by asking the server again or by
 * filtering the rows it already has. Which of the two happens decides what has to be
 * waited for, and a capture taken too early is the bug this exists to prevent: the
 * picture showed the *unfiltered* rows with the term typed into the box (`F-603`).
 *
 * The page's own first read must have settled before this is called, or that read is
 * the one this would mistake for the search's. After the fill the two are told apart
 * by counting reads: the search's own read arrives behind the debounce, and the answer
 * it gets is what the capture waits for. A page that filters the rows it holds issues
 * nothing, and the debounce is all there is to wait out.
 *
 * Predicting the form from the page's method name does not work, and guessing it
 * costs a full wait when wrong: a fixed 15 s response wait turned three of a realm's
 * client-filtered captures into timeouts on CI, where the whole test is budgeted at
 * 20 s.
 */
async function fillBrowseSearch(page: Page, searchText: string, findPath: string): Promise<void> {
    const isRead = (url: string, method: string) => method === 'POST' && url.includes(findPath);
    let reads = 0;
    let answers = 0;
    const onRequest = (request: Request) => {
        if (isRead(request.url(), request.method())) reads++;
    };
    const onResponse = (response: Response) => {
        if (isRead(response.url(), response.request().method())) answers++;
    };
    page.on('request', onRequest);
    page.on('response', onResponse);
    try {
        const readsBefore = reads;
        const answersBefore = answers;
        await page.getByTestId('browse-search').fill(searchText);
        // The probe outlasts the debounce, so a page that filters the rows it holds
        // has committed by the time this gives up: nothing more to wait for.
        if (!(await settles(() => reads > readsBefore, page, SEARCH_PROBE_MS))) return;
        // A read nobody answered is a page still loading; the caller's table wait
        // reports that better than this helper could.
        await settles(() => answers > answersBefore, page, FILTERED_READ_MS);
    } finally {
        page.off('request', onRequest);
        page.off('response', onResponse);
    }
}

/** Poll `until` in short steps, so a debounce is waited out rather than guessed at. */
async function settles(until: () => boolean, page: Page, timeout: number): Promise<boolean> {
    const deadline = Date.now() + timeout;
    while (!until()) {
        if (Date.now() > deadline) return false;
        await page.waitForTimeout(POLL_MS);
    }
    return true;
}

/**
 * Register one test per page. Each opens the page from the portal menu, waits for
 * its data and captures it, so a realm states its pages as a list.
 *
 * `waitForTableData: false` is for a page that legitimately has no table — a
 * search page before anything is typed, say — where the wait could only time out.
 */
export function openPages(
    test: ITestFn,
    expect: Expect,
    {
        methods,
        screenshot,
        waitForTableData = true,
        searchText: defaultSearchText,
        baselinePrefix,
        docs,
        docsOnly = false,
    }: IOpenPagesOptions,
): void {
    if (docsOnly && docs === undefined) {
        throw new Error('openPages: docsOnly needs a docs() name for the images it writes');
    }
    for (const entry of methods) {
        const page: IOpenPage = typeof entry === 'string' ? {method: entry} : entry;
        const baseline =
            page.screenshot ??
            screenshot?.(page.method) ??
            `${page.method.replace(/\./g, '-')}.png`;
        test(`${docsOnly ? 'document' : 'open'} ${page.method}`, async ({portal}) => {
            await portal.menuClick(page.method);
            const searchText = page.searchText ?? defaultSearchText;
            const wantsData = page.waitForTableData ?? waitForTableData;
            if (searchText !== undefined) {
                // The page's own first read has to settle first: a read still in
                // flight would be the one the search wait mistakes for its own.
                // `@@F-603`
                if (wantsData) await portal.waitForTableData();
                const [subject, object] = page.method.split('.');
                await fillBrowseSearch(portal.page, searchText, `/rpc/${subject}/${object}/find`);
            }
            if (wantsData) await portal.waitForTableData();
            const target =
                page.region === undefined ? portal.page : portal.page.locator(page.region).first();
            if (!docsOnly) {
                await expect(target).toHaveScreenshot(
                    baselinePrefix === undefined ? baseline : `${baselinePrefix}-${baseline}`,
                    page.mask === undefined
                        ? {}
                        : {mask: page.mask.map(selector => portal.page.locator(selector))},
                );
            }
            const docsName = page.docs ?? docs?.(page.method);
            if (docsName !== undefined) {
                await captureDocs(portal, {
                    name: docsName,
                    ...(page.region === undefined ? {} : {region: page.region}),
                    ...(page.mask === undefined ? {} : {mask: page.mask}),
                });
            }
        });
    }
}
