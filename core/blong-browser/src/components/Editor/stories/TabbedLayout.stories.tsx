/**
 * TabbedLayout story — blong-browser adaptation.
 *
 * Three tabs with cards split across them: "A and B", "C and D", "E, F and G".
 */
import type {Meta} from '@storybook/react-vite';
import type {StoryFn} from '../Editor.stories.js';
import {Editor} from '../Editor.js';

const meta: Meta<typeof Editor> = {title: 'Editor/TabbedLayout', component: Editor};
export default meta;

const mock = (count: number) => Array.from({length: count}, (_, i) => `field${i + 1}`);
const mockSchema = (count: number) =>
    Object.fromEntries(mock(count).map(name => [name, {title: name}]));

export const TabbedLayout: StoryFn = () => (
    <Editor
        schema={{properties: mockSchema(4)}}
        cards={{
            a1: {label: 'A 1', widgets: mock(3)},
            a2: {label: 'A 2', widgets: mock(2)},
            b1: {label: 'B 1', widgets: mock(2)},
            b2: {label: 'B 2', widgets: mock(1)},
            c1: {label: 'C 1', widgets: mock(4)},
            c2: {label: 'C 2', widgets: mock(1)},
            d: {label: 'D', widgets: mock(4)},
            e: {label: 'E', widgets: mock(2)},
            f1: {label: 'F 1', widgets: mock(1)},
            f2: {label: 'F 2', widgets: mock(1)},
            g: {label: 'G', widgets: mock(1)},
        }}
        editable
        layout="edit"
        layouts={{
            edit: {
                orientation: 'top',
                items: [
                    {
                        id: 'ab',
                        label: 'A and B',
                        widgets: [
                            ['a1', 'a2'],
                            ['b1', 'b2'],
                        ],
                    },
                    {id: 'cd', label: 'C and D', widgets: [['c1', 'c2'], ['d']]},
                    {id: 'efg', label: 'E, F and G', widgets: [['e'], ['f1', 'f2'], ['g']]},
                ],
            },
        }}
    />
);
