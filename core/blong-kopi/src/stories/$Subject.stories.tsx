import {portal} from '@feasibleone/blong-browser/storyHelper';
import type {Meta} from '@storybook/react-vite';

const meta: Meta = {
    title: '$Subject/Portal',
    parameters: {layout: 'fullscreen'},
};
export default meta;

/** The whole portal shell — navigation, tabs and every page of the realm at once. */
export const $Subject = portal();
