/**
 * ThumbIndexLayout story — layout with PanelMenu orientation='left' navigation.
 */
import type {Meta} from '@storybook/react';
import type {StoryFn} from '../Editor.stories.js';
import {Editor} from '../index.js';

const meta: Meta<typeof Editor> = {
    title: 'Editor/ThumbIndexLayout',
    component: Editor,
};
export default meta;

export const ThumbIndexLayout: StoryFn = () => (
    <Editor
        schema={{properties: {}}}
        cards={{
            a1: {label: 'A 1', widgets: []},
            a2: {label: 'A 2', widgets: []},
            b1: {label: 'B 1', widgets: []},
            b2: {label: 'B 2', widgets: []},
        }}
        editable
        layout="edit"
        layouts={{
            edit: {
                orientation: 'left',
                items: [
                    {id: 'ab', label: 'A / B', icon: 'pi pi-user', widgets: ['a1', 'a2']},
                    {id: 'cd', label: 'B', icon: 'pi pi-id-card', widgets: ['b1', 'b2']},
                ],
            },
        }}
    />
);
