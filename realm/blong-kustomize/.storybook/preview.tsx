import unchanged from '@feasibleone/blong';
import {defineBlongStorybookPreview} from '@feasibleone/blong-browser/storybook.tsx';
// The composed entry, not `../browser.ts`: a model story needs the portal port
// (blong-browser), which only the composed entry carries. A realm's composed
// entry is `index.browser.ts`; a suite's `browser.ts` already is one.
import browser from '../index.browser.ts';

// One line on purpose.  The factory owns the toolbar — backend (mock / live
// JSON-RPC / live MLE), role, theme, language, direction — plus its persistence
// and the decorators that apply them, so every realm's preview (and the kukum
// template that generates it) is this same line.  `backend: true` adds the
// Backend and Role items: these stories run on the loaded platform, so there is
// a backend adapter to point at a gateway.
export default defineBlongStorybookPreview(browser, {backend: true});
