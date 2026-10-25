/**
 * Sport / portal — the shell with the realm's menu.
 *
 * `sport.portal.params` contributes the groups; the portal fixture is the same one
 * the Playwright portal spec photographs, so the two agree on what the menu holds.
 */
import {portal} from '@feasibleone/blong-browser/storyHelper';
import type {Meta} from '@storybook/react-vite';

const meta: Meta = {title: 'Sport/Portal', parameters: {layout: 'fullscreen'}};
export default meta;

/** The portal shell after login, with the sport menu closed. */
export const Home = portal();
