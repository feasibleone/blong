import config from '../../tools/eslint/config.mjs';

// `test/fixture` is generated output, committed so its Playwright baselines live
// in git. Its own eslint config governs it, not this one.
export default [{ignores: ['test/fixture/**']}, ...config];
