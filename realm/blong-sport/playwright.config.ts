import {defineBlongConfig} from '@feasibleone/blong-browser/playwright/config';
import {BG_MODELS_SEED} from './test/bgModels.seed.js';

// The translation harvest is installed from here, not from a spec: Playwright
// resolves `globalSetup`/`globalTeardown` against the config, so only a value this
// function can see reaches the runner (`F-607`).
export default defineBlongConfig({
    use: {blongTranslationSeed: BG_MODELS_SEED},
});
