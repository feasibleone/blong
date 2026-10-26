/**
 * The runner half of translation harvesting — `globalTeardown`.
 *
 * The single writer (`D-632`): every worker has left its pending report behind, and
 * this hook merges them into the seed files under a lock, once, in the runner
 * process. It is a file rather than a function in the config because Playwright
 * resolves `globalTeardown` to a path (`F-607`).
 *
 * It merges only a **harvest run** — the one whose `globalSetup` minted a run token
 * because `BLONG_TRANSLATION_HARVEST` was set. A missing token means no worker wrote
 * a report and the seed files must stay untouched.
 */
import {mergePendingTranslations, type ISeedOptions} from './translate.js';

export default async function globalTeardown(): Promise<void> {
    const declared = process.env['BLONG_TRANSLATION_SEED'];
    if (!declared || !process.env['BLONG_TRANSLATION_RUN']) return;
    const seed = JSON.parse(declared) as ISeedOptions;
    const summary = mergePendingTranslations(seed);
    if (!summary.runs) return;
    console.log(
        `[translation seed] +${summary.label} label(s), ` +
            `+${summary.translation} resource name(s) from ${summary.runs} report(s)`,
    );
}
