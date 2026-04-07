/**
 * MasterDetailPolymorphic story — blong-browser adaptation.
 *
 * A master table shows a list of shapes. Selecting a row reveals a type-specific
 * detail card (circle, square, triangle, rectangle, ellipse) based on `card.match`.
 * Each detail card uses `card.watch: 'shape'` to display the selected row's fields.
 */
import type {Meta} from '@storybook/react';
import {within} from '@testing-library/react';
import {userEvent} from '@testing-library/user-event';
import type {StoryFn} from '../Editor.stories.js';
import {Editor} from '../index.js';

const meta: Meta<typeof Editor> = {title: 'Editor/MasterDetailPolymorphic', component: Editor};
export default meta;

const shapeValue = {
    shape: [
        {name: 'Big circle', type: 'circle', radius: 100},
        {name: 'Small ellipse', type: 'ellipse', radius: 5, secondRadius: 4},
        {name: 'Big square', type: 'square', side1: 100},
        {name: 'Medium triangle', type: 'triangle', side1: 30, side2: 40, side3: 50},
        {name: 'Small rectangle', type: 'rectangle', side1: 2, side2: 4},
    ],
};

const common = {
    className: 'col-12 md:col-4',
    label: 'Shape properties',
    watch: 'shape',
};

export const MasterDetailPolymorphic: StoryFn = () => (
    <Editor
        schema={{
            properties: {
                shape: {
                    title: '',
                    type: 'array',
                    widget: {
                        type: 'table',
                        selectionMode: 'single',
                        columns: ['name', 'type'],
                    },
                    items: {
                        properties: {
                            name: {title: 'Name'},
                            type: {title: 'Type'},
                            radius: {title: 'Radius'},
                            secondRadius: {title: 'Second Radius'},
                            side1: {title: 'Side Length'},
                            side2: {title: 'Second Side'},
                            side3: {title: 'Third Side'},
                        },
                    },
                },
                radius: {title: 'Radius', type: 'number'},
                secondRadius: {title: 'Second Radius', type: 'number'},
                side1: {title: 'Side Length', type: 'number'},
                side2: {title: 'Second Side', type: 'number'},
                side3: {title: 'Third Side', type: 'number'},
            },
        }}
        cards={{
            shapes: {
                label: 'Shapes',
                className: 'col-12 md:col-4',
                widgets: ['shape'],
            },
            shapeCircle: {
                ...common,
                match: {type: 'circle'},
                widgets: ['radius'],
            },
            shapeEllipse: {
                ...common,
                match: {type: 'ellipse'},
                widgets: ['radius', 'secondRadius'],
            },
            shapeSquare: {
                ...common,
                match: {type: 'square'},
                widgets: ['side1'],
            },
            shapeRectangle: {
                ...common,
                match: {type: 'rectangle'},
                widgets: ['side1', 'side2'],
            },
            shapeTriangle: {
                ...common,
                match: {type: 'triangle'},
                widgets: ['side1', 'side2', 'side3'],
            },
        }}
        value={shapeValue}
        layout="edit"
        layouts={{
            edit: [
                'shapes',
                ['shapeCircle', 'shapeSquare', 'shapeTriangle', 'shapeRectangle', 'shapeEllipse'],
            ],
        }}
    />
);

MasterDetailPolymorphic.play = async ({canvasElement}) => {
    const canvas = within(canvasElement);
    // Wait for data to render
    const ellipseRow = await canvas.findByText('Small ellipse');
    await userEvent.click(ellipseRow);
    await new Promise(resolve => setTimeout(resolve, 200));
};
