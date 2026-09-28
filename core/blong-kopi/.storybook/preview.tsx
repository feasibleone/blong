import withBlong from '@feasibleone/blong-browser/storybook.tsx';
// The composed entry, not `../browser.ts`: a model story needs the portal port
// (blong-browser), which only the composed entry carries. A realm's composed
// entry is `index.browser.ts`; a suite's `browser.ts` already is one.
import browser from '../index.browser.ts';

export default {
    decorators: [withBlong(browser)],
    parameters: {
        actions: {argTypesRegex: '^on[A-Z].*'},
        layout: 'fullscreen',
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/,
            },
        },
    },
};
