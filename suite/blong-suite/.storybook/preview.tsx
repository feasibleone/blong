import withBlong from '@feasibleone/blong-browser/storybook.tsx';
import browser from '../browser.ts';

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
