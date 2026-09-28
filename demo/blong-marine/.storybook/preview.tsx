import withBlong from '@feasibleone/blong-browser/storybook.tsx';
// The composed entry, not `../browser.ts`: the marine realm alone carries no
// `ui.portal` port, so a model story (`page('marine.species.browse')`) would
// render against an undefined portal and throw (T-162).
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
