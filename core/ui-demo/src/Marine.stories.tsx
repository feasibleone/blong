import type {Meta} from '@storybook/react-vite';
import {portal} from './storyHelper.js';

const meta: Meta = {
    title: 'Marine/Portal',
    parameters: {layout: 'fullscreen'},
};
export default meta;

export const Marine = portal();
