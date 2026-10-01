import {defineBlongStorybookPreview} from '@feasibleone/blong-browser/storybook.tsx';
// A suite's entry already is the composed one.
import browser from '../browser.ts';

// The shared factory: the toolbar (backend / role / theme / language /
// direction), its persistence and the decorators that apply it all live in
// blong-browser, so this file is the same one line in every suite.
export default defineBlongStorybookPreview(browser, {backend: true});
