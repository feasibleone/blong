import type {Meta} from '@storybook/react';
import type {StoryFn} from '../Editor.stories.js';
import {Editor} from '../index.js';

const meta: Meta<typeof Editor> = {
    title: 'Editor/ResponsiveLayout',
    component: Editor,
};
export default meta;

const mock = (count: number) => Array.from({length: count}, (_, i) => `field${i + 1}`);
const mockSchema = (count: number) =>
    Object.fromEntries(mock(count).map(name => [name, {title: name}]));

export const ResponsiveLayout: StoryFn = () => (
    <Editor
        schema={{properties: mockSchema(12)}}
        cards={{
            a1: {label: 'A 1', className: 'sm:col-6 xl:col-4', widgets: mock(3)},
            a2: {label: 'A 2', widgets: mock(2)},
            b1: {label: 'B 1', className: 'sm:col-6 xl:col-4', widgets: mock(2)},
            b2: {label: 'B 2', widgets: mock(1)},
            c1: {label: 'C 1', className: 'md:col-6 xl:col-4', widgets: mock(4)},
            c2: {label: 'C 2', widgets: mock(1)},
        }}
        editable
        layout="edit"
        layouts={{
            edit: [
                ['a1', 'a2'],
                ['b1', 'b2'],
                ['c1', 'c2'],
            ],
        }}
    />
);
