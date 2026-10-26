/**
 * Rendered-string collector.
 *
 * `useText` reports every key it renders while collection is on, so the set is
 * exactly what the screen asked for — not what a regex over the source believes.
 * The report separates what was rendered from what the active dictionary could
 * not answer, which is the list a translation seed needs (`D-625`).
 *
 * Browser-only and dependency-free on purpose: this module is part of the app
 * bundle, and the file-system half of the feature lives in `src/playwright`
 * (`D-633`). Nothing here imports a `node:` builtin or a test runner.
 */

/** What a test (or the report page) reads: rendered keys, and the ones unanswered. */
export interface ITranslationReport {
    language: string;
    rendered: string[];
    missing: string[];
}

const counts = new Map<string, number>();
let collecting = false;
let provider: () => {language: string; dictionary: Record<string, string>} = () => ({
    language: 'en',
    dictionary: {},
});

/** Turn collection on and drop what an earlier screen recorded. */
export function collectStart(): void {
    collecting = true;
    counts.clear();
    publish();
}

/** Turn collection off — the normal state of a production app. */
export function collectStop(): void {
    collecting = false;
}

/** Whether a render is being recorded (cheap enough to check in `useText`). */
export function isCollecting(): boolean {
    return collecting;
}

/**
 * Record one rendered key. Called from `useText`, so it covers `<Text>`, the
 * `Button` wrapper and every widget that renders through them.
 */
export function recordRendered(key: string): void {
    if (!collecting || !key) return;
    counts.set(key, (counts.get(key) ?? 0) + 1);
}

/**
 * The current report, for the language the provider answers with.
 *
 * A key is missing when the active dictionary has no entry or an empty one — an
 * empty `labelText` is a seed TODO marker, not a translation (`D-631`).
 */
export function translationReport(): ITranslationReport {
    const {language, dictionary} = provider();
    const rendered = [...counts.keys()].sort((a, b) => a.localeCompare(b, 'en'));
    return {
        language,
        rendered,
        missing: rendered.filter(key => !dictionary[key]),
    };
}

/** The render count of one key, for the in-app page. */
export function renderedCounts(): Record<string, number> {
    return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b, 'en')));
}

/** Let the store answer "which language, which dictionary" without a cycle. */
export function setTranslationProvider(
    next: () => {language: string; dictionary: Record<string, string>},
): void {
    provider = next;
    publish();
}

/**
 * Publish the collector on `window` so a Playwright test and the report page can
 * reach it. `report()` is the only thing a test needs; `start`/`stop` let a dev
 * session turn collection on from the console.
 */
function publish(): void {
    if (typeof window === 'undefined') return;
    (window as unknown as Record<string, unknown>).__blongI18n = {
        start: collectStart,
        stop: collectStop,
        report: translationReport,
        counts: renderedCounts,
    };
}

// A test enables collection before the app boots (`page.addInitScript`), so the
// first authenticated render is already recorded.
if (
    typeof window !== 'undefined' &&
    (window as unknown as {__blongI18nCollect?: boolean}).__blongI18nCollect
) {
    collectStart();
}
