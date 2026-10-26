/**
 * The translation harvest seeds this suite declares.
 *
 * A module of its own because two places need it: the spec that renders the pages
 * (`bgModels.play.ts`) and the Playwright config, which is the only place the
 * *runner* can be told — its `globalSetup` and `globalTeardown` are files, and a
 * `test.use()` option in a spec never reaches them (`F-607`).
 */
export const BG_MODELS_SEED = {
    language: 'bg',
    label: 'meta/db/bg-coreLabelSeed.yaml',
    translation: 'meta/db/bg-coreTranslationSeed.yaml',
};
