/**
 * TypeField story — type-discriminator field driving layout.
 *
 * NOTE: The `typeField` prop (selecting layout tabs based on a type field value)
 * is not yet implemented in blong-ui. This stub shows the target data shape
 * using a tabbed layout with a static type field.
 *
 */
import type {Meta} from '@storybook/react';
import type {StoryFn} from '../Editor.stories.js';
import {Editor} from '../index.js';

const meta: Meta<typeof Editor> = {title: 'Editor/TypeField', component: Editor};
export default meta;

export const TypeField: StoryFn = () => (
    <Editor
        schema={{
            properties: {
                type: {title: 'Type'},
                radius: {title: 'Radius', type: 'number'},
            },
        }}
        cards={{
            editCircle: {label: 'Shape', widgets: ['type', 'radius']},
        }}
        value={{type: 'circle', radius: 10}}
        editable
        editMode
        layout="editCircle"
        layouts={{
            editCircle: {
                orientation: 'top',
                items: [
                    {id: 'circle', icon: 'pi pi-circle', label: 'Circle', widgets: ['editCircle']},
                ],
            },
        }}
    />
);
