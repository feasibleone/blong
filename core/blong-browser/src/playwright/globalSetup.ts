/**
 * The runner half of translation harvesting — `globalSetup`.
 *
 * Playwright resolves `globalSetup` to a **file**, runs it in the runner process
 * before any worker starts, and nothing else: a function assigned to the config is
 * treated as a path and fails to load, and a `test.use()` option in a spec never
 * reaches here (`F-607`). So the seed travels as an environment variable that
 * `defineBlongConfig` writes when the suite declares it, and this hook mints the
 * run token every worker's fixture reads.
 *
 * Writing a seed is an **explicit** act: a suite declaring the seed says where its
 * translations belong, not that every run appends to them. Without
 * `BLONG_TRANSLATION_HARVEST` this hook does nothing, no worker writes a pending
 * report, and the teardown has nothing to merge — which keeps an ordinary run, and a
 * CI run, read-only against the tree.
 */
import {startTranslationRun, type ISeedOptions} from './translate.js';

export default async function globalSetup(): Promise<void> {
    const declared = process.env['BLONG_TRANSLATION_SEED'];
    if (!declared || !process.env['BLONG_TRANSLATION_HARVEST']) return;
    const seed = JSON.parse(declared) as ISeedOptions;
    startTranslationRun(seed);
}
