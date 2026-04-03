/**
 * TabbedLayout story — blong-ui adaptation.
 *
 * Uses the ITabLayoutConfig format introduced in useLayout to render
 * multiple cards grouped into tabs.
 */
import type {Meta} from '@storybook/react';
import type {StoryFn} from '../Editor.stories.js';
import {Editor} from '../index.js';

const meta: Meta<typeof Editor> = {
    title: 'Editor/TabbedLayout',
    component: Editor,
};
export default meta;

const mock = (count: number) => Array.from({length: count}, (_, i) => `field${i + 1}`);
const mockSchema = (count: number) =>
    Object.fromEntries(mock(count).map(name => [name, {title: name}]));

export const TabbedLayout: StoryFn = () => (
    <Editor
        schema={{properties: mockSchema(8)}}
        cards={{
            a1: {label: 'A 1', widgets: mock(3)},
            a2: {label: 'A 2', widgets: mock(2)},
            b1: {label: 'B 1', widgets: mock(2)},
            b2: {label: 'B 2', widgets: mock(1)},
        }}
        editable
        layout="edit"
        layouts={{
            edit: {
                orientation: 'top',
                items: [{id: 'ab', label: 'A and B', widgets: ['a1', 'a2', 'b1', 'b2']}],
            },
        }}
    />
);
