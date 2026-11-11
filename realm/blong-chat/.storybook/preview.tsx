import {defineBlongStorybookPreview} from '@feasibleone/blong-browser/storybook.tsx';

// The composed entry, not `../browser.ts`: a model story needs the portal port, which only the
// composed entry carries.
import browser from '../index.browser.ts';

export default defineBlongStorybookPreview(browser, {backend: true});
