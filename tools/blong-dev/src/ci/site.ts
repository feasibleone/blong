/**
 * The reports site: what a run published, without a credential.
 *
 * Two documents are read from it. `failures/<workflow>/<run>/failures.json` is the machine
 * readable index a run publishes whenever its report holds a problem, and the first thing a
 * diagnosis has; a run with nothing to report publishes none, so the request 404s and that is
 * itself the answer. The per-package page of a *previous* run — `<package>/<workflow>/<run>/` — is
 * what says whether a package was green before and how long it took, which is the question that
 * separates a regression from a runner that was slow.
 *
 * The base URL is the reports repository's Pages site; `--site` and `CI_REPORTS_BASE` are how a
 * fork or a second deployment points the tool somewhere else.
 */

import type {IFailuresJson} from '../report/failuresBundle.ts';
import {
    parsePackageSummary,
    PACKAGE_SUMMARY_FILE,
    type IPackageSummary,
} from '../report/packagePage.ts';

/** The site this repository's runs are published to. */
export const DEFAULT_SITE = 'https://blong-ci.feasible.one';

/** The site to read, with the trailing slash trimmed. */
export function siteBase(flag?: string): string {
    const base = flag ?? process.env['CI_REPORTS_BASE'] ?? DEFAULT_SITE;
    return base.replace(/\/+$/, '');
}

/** Where a run's failure bundle lives; `latest` is the alias the last red run keeps. */
export function failuresUrl(base: string, workflow: string, run: number | 'latest'): string {
    return `${base}/failures/${workflow}/${run}/failures.json`;
}

/** Where a package's page for one run lives. */
export function packagePageUrl(base: string, pkg: string, workflow: string, run: number): string {
    return `${base}/${pkg}/${workflow}/${run}/`;
}

/** Fetch a document, resolving `undefined` for anything that is not a 200. */
export async function fetchText(url: string): Promise<string | undefined> {
    try {
        const response = await fetch(url, {redirect: 'follow'});
        if (!response.ok) return undefined;
        return await response.text();
    } catch {
        return undefined;
    }
}

/**
 * The bundle a run published, or `undefined` when it published none.
 *
 * A run with nothing to report publishes no bundle *and* the `latest` alias stops pointing at it,
 * so a 404 here is a verdict about the run rather than a failure of the tool. A bundle can hold
 * flaky entries and nothing else — a run whose only problem passed on retry — which is why the
 * caller asks for `totals.failed` rather than for the document's existence (@@F-544).
 */
export async function fetchFailures(
    base: string,
    workflow: string,
    run: number | 'latest',
): Promise<IFailuresJson | undefined> {
    const body = await fetchText(failuresUrl(base, workflow, run));
    if (body === undefined) return undefined;
    try {
        return JSON.parse(body) as IFailuresJson;
    } catch {
        return undefined;
    }
}

/**
 * The summary of one package in one run, or `undefined` when it published none.
 *
 * The machine summary first, because it is unambiguous and small; then the page, for the runs
 * published before it existed (which is every run older than the change that added it, all of
 * them within the site's fifteen-run window) (@@D-562).
 */
export async function fetchPackageSummary(
    base: string,
    pkg: string,
    workflow: string,
    run: number,
): Promise<IPackageSummary | undefined> {
    const published = await fetchText(
        `${packagePageUrl(base, pkg, workflow, run)}${PACKAGE_SUMMARY_FILE}`,
    );
    if (published !== undefined) {
        try {
            return JSON.parse(published) as IPackageSummary;
        } catch {
            // A summary that cannot be read is read from the page instead.
        }
    }
    const html = await fetchText(packagePageUrl(base, pkg, workflow, run));
    return html === undefined ? undefined : parsePackageSummary(html);
}
