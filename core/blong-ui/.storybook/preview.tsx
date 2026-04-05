import type { Preview } from '@storybook/react';
import 'primeflex/primeflex.css';
import 'primeicons/primeicons.css';
import 'primereact/resources/primereact.min.css';
import 'primereact/resources/themes/vela-blue/theme.css';
import { withDispatch } from './dispatch.js';

// Ensure proper height propagation for fullscreen stories
const style = document.createElement('style');
style.textContent = `
    /* Fix Storybook iframe to fill available space */
    html, body {
        margin: 0;
        padding: 0;
        height: 100%;
        overflow: hidden;
        font-family: 'Roboto';
        color: var(--text-color);
        background-color: var(--surface-0);
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
    decorators: [withDispatch()],
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

export default preview;
