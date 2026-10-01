import {defineBlongStorybookPreview} from '@feasibleone/blong-browser/storybook.tsx';
// The composed entry, not `../browser.ts`: the marine realm alone carries no
// `ui.portal` port, so a model story (`page('marine.species.browse')`) would
// render against an undefined portal and throw (T-162).
import browser from '../index.browser.ts';

// The shared factory: the toolbar (backend / role / theme / language /
// direction), its persistence and the decorators that apply it all live in
// blong-browser, so this file is the same one line in every realm.
export default defineBlongStorybookPreview(browser, {backend: true});

