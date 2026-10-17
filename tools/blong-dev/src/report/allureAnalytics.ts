/**
 * Rewrites the analytics Allure embeds in a report page.
 *
 * Allure 3's report template always inlines a Google Analytics tag for its own property
 * (`analyticsEnable: true` is hardcoded, and so is `G-xxx`), and no plugin option
 * changes either. A report of this repository is internal CI output, so where its page
 * views are counted is the operator's decision: `BLONG_ALLURE_GA_ID` points the tag at
 * another measurement ID, and `BLONG_ALLURE_GA_ID=off` removes it, so a report opened with
 * no intention of being measured is not measured anywhere (@@D-564).
 *
 * The replacement works on the measurement ID the page already carries, and the removal on
 * the two script tags Allure writes around it. A template change that renames or moves
 * them therefore leaves the page as generated instead of corrupting it; an invalid ID is
 * refused with a warning for the same reason.
 */

import {existsSync, readFileSync, writeFileSync} from 'node:fs';

/** The measurement ID in the loader script Allure writes. */
const GTM_LOADER = /https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=([A-Za-z0-9_-]+)/;

/** Allure's analytics: the loader and the `gtag('config', …)` block that follows it. */
const ANALYTICS_BLOCK =
    /[ \t]*<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=[A-Za-z0-9_-]+"><\/script>\s*<script>\s*window\.dataLayer[\s\S]*?gtag\('config'[\s\S]*?<\/script>\n?/i;

/** Something that can be put in an attribute and a script string without escaping. */
const MEASUREMENT_ID = /^[A-Za-z0-9_-]{1,64}$/;

export interface IAnalyticsOptions {
    /** Measurement ID the report's page views are collected under. */
    id?: string;
    /** Remove the analytics scripts instead of collecting anything. */
    off?: boolean;
}

export interface IAnalyticsRewrite {
    /** Whether the page was rewritten. */
    changed: boolean;
    /** The measurement ID the page now reports to, when one is set. */
    id?: string;
    /** Whether the analytics scripts were removed. */
    removed?: boolean;
}

/**
 * Read the analytics configuration from the environment.
 *
 * `BLONG_ALLURE_GA_ID` names the measurement ID; `off`, `none` or `false` removes the
 * analytics instead. Unset leaves the page exactly as Allure generated it, which is the
 * only value that does not change what a run does without being asked.
 */
export function configuredAnalytics(): IAnalyticsOptions {
    const raw = (process.env['BLONG_ALLURE_GA_ID'] ?? '').trim();
    if (!raw) return {};
    if (/^(off|none|false)$/i.test(raw)) return {off: true};
    return {id: raw};
}

/** Point the page's analytics at a measurement ID, or remove it. */
export function rewriteAllureAnalytics(
    htmlFile: string,
    options: IAnalyticsOptions = {},
): IAnalyticsRewrite {
    if (!existsSync(htmlFile)) return {changed: false};
    const html = readFileSync(htmlFile, 'utf8');

    if (options.off) {
        const stripped = html.replace(ANALYTICS_BLOCK, '');
        if (stripped === html) return {changed: false};
        writeFileSync(htmlFile, stripped);
        return {changed: true, removed: true};
    }

    if (!options.id) return {changed: false};
    if (!MEASUREMENT_ID.test(options.id)) {
        process.stderr.write(
            `blong-dev: BLONG_ALLURE_GA_ID is not a measurement ID ("${options.id}"); ` +
                'the report keeps the analytics tag Allure wrote\n',
        );
        return {changed: false};
    }

    const current = GTM_LOADER.exec(html);
    if (!current || current[1] === options.id) return {changed: false};
    // Both references have to move together: a page that loads the new property but
    // configures the old one would report half its traffic to Allure. A template that
    // wrote them differently is left as it is rather than half-rewritten.
    const loader = `?id=${current[1]}`;
    const config = `gtag('config', '${current[1]}'`;
    if (!html.includes(loader) || !html.includes(config)) return {changed: false};
    const next = html
        .split(loader)
        .join(`?id=${options.id}`)
        .split(config)
        .join(`gtag('config', '${options.id}'`);
    writeFileSync(htmlFile, next);
    return {changed: true, id: options.id};
}
