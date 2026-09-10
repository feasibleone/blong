import type {Meta} from '@storybook/react-vite';
import {portal} from '@feasibleone/blong-browser/storyHelper';

const meta: Meta = {
    title: 'Marine/Portal',
    parameters: {layout: 'fullscreen'},
};
export default meta;

export const Marine = portal();
