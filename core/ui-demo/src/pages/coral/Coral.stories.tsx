import {Model} from '@feasibleone/blong-browser';
import type {Meta, StoryObj} from '@storybook/react-vite';

const meta: Meta = {
    title: 'Marine/Coral',
    parameters: {layout: 'fullscreen'},
};
export default meta;

export const CoralBrowse: StoryObj = {
    render: () => <Model componentName="marine.coral.browse" />,
};

export const CoralOpen: StoryObj = {
    render: () => (
        <Model
            componentName="marine.coral.open"
            params={{coralId: 1}}
        />
    ),
};

export const CoralNew: StoryObj = {
    render: () => <Model componentName="marine.coral.new" />,
};

export const CoralReport: StoryObj = {
    render: () => <Model componentName="marine.coral.report" />,
};
