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
import type {Expect} from '@playwright/test';
import type {ITestFn} from './model.js';

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
    }: IOpenPagesOptions,
): void {
    for (const entry of methods) {
        const page: IOpenPage = typeof entry === 'string' ? {method: entry} : entry;
        const baseline =
            page.screenshot ?? screenshot?.(page.method) ?? `${page.method.replace(/\./g, '-')}.png`;
        test(`open ${page.method}`, async ({portal}) => {
            await portal.menuClick(page.method);
            const searchText = page.searchText ?? defaultSearchText;
            if (searchText !== undefined) {
                await portal.page.getByTestId('browse-search').fill(searchText);
                // Filtering is client-side and re-renders after a keystroke batch.
                await portal.page.waitForTimeout(300);
            }
            if (page.waitForTableData ?? waitForTableData) await portal.waitForTableData();
            const target =
                page.region === undefined
                    ? portal.page
                    : portal.page.locator(page.region).first();
            await expect(target).toHaveScreenshot(
                baselinePrefix === undefined ? baseline : `${baselinePrefix}-${baseline}`,
                page.mask === undefined
                    ? {}
                    : {mask: page.mask.map(selector => portal.page.locator(selector))},
            );
        });
    }
}
