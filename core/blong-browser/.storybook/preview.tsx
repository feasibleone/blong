import type {Preview} from '@storybook/react-vite';
import 'primeflex/primeflex.css';
import 'primeicons/primeicons.css';
import 'primereact/resources/primereact.min.css';
import 'primereact/resources/themes/vela-blue/theme.css';
import {bgLocale, useAppStore} from '../src/index.ts';
import {defineBlongStorybookPreview} from '../storybook.tsx';
import {bgTranslations, withDispatch, type Handler} from './dispatch.js';

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

// The toolbar's Language item swaps the active dictionary through the app
// store, so the one dictionary this package ships has to be registered up
// front — a story's own `lang` arg only ever set it for that render.
useAppStore.getState().setTranslationsByLanguage({bg: bgTranslations});

/**
 * The preview for the component library's own stories.
 *
 * Unlike a realm's preview these stories have no platform and no backend
 * adapter: `withDispatch` answers every method from in-file fixtures, so the
 * factory is given the decorator instead of a browser entry and the toolbar
 * offers the presentation choices only (no `backend` item).
 *
 * `parameters.theme.languages` registers the bundled Bulgarian PrimeReact
 * locale for every story, so the toolbar's Language item has widget strings to
 * switch as well as app ones.
 */
export const makePreview = ({overrides}: {overrides?: Record<string, Handler>} = {}) =>
    defineBlongStorybookPreview(
        {decorators: [withDispatch(overrides)]},
        {parameters: {theme: {languages: {bg: bgLocale}}}},
    );

const preview: Preview = makePreview({});
export default preview;
