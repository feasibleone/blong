import type {Preview} from '@storybook/react-vite';

import '@svar-ui/react-grid/all.css';

// Ensure proper height propagation for fullscreen stories
const style = document.createElement('style');
style.textContent = `
    /* Fix Storybook iframe to fill available space */
    html, body {
        margin: 0;
        padding: 0;
        height: 100%;
        overflow: hidden;
        /* The viewer draws on the grid's theme, and that theme blanks its own font family when it
           is mounted with fonts={false} — the prop this package sets to keep the vendor's
           stylesheet off the network (@@F-805). A blank family is a family nothing declares, so the
           text falls back to the browser's default, which is a serif: the screenshots were
           rendered in Times. What the theme expects is the host's font, and the host of a story is
           this page, so the stack the portal's own theme declares is named here — the same rule
           and the same reason as browser.css in blong-browser. */
        font-family: var(--font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
    }

    /* Make storybook-root fill the viewport for fullscreen layout */
    #storybook-root {
        height: 100%;
        width: 100%;
        display: flex;
        flex-direction: column;
    }

    /* Ensure stories with fullscreen layout fill the container */
    #storybook-root > * {
        flex: 1;
        min-height: 0;
    }
`;
document.head.appendChild(style);

const preview: Preview = {
    parameters: {
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
            },
        },
        layout: 'fullscreen',
    },
};

export default preview;
