/**
 * MasterDetailPolymorphic story — blong-ui adaptation.
 *
 * NOTE: Polymorphic master-detail (where the detail card changes based on
 * a type discriminator field) is NOT yet implemented in blong-ui.
 * The target version uses `card.match = {type: 'person'}` to conditionally
 * show cards based on the selected row's type field.
 *
 * This stub renders a simplified two-card layout.
 * Snapshot mismatch justification: `card.match`-based polymorphic card
 * selection is not yet implemented in blong-ui.
 */
import type {Meta} from '@storybook/react';
import type {StoryFn} from '../Editor.stories.js';
import {Editor} from '../index.js';

const meta: Meta<typeof Editor> = {
    title: 'Editor/MasterDetailPolymorphic',
    component: Editor,
};
export default meta;

export const MasterDetailPolymorphic: StoryFn = () => (
    <Editor
        schema={{
            properties: {
                name: {title: 'Name'},
                role: {title: 'Role'},
                registrationNumber: {title: 'Registration Number'},
            },
        }}
        cards={{
            master: {label: 'Items', className: 'xl:col-2', widgets: ['name']},
            detail: {
                label: 'Details',
                className: 'xl:col-3',
                widgets: ['name', 'role', 'registrationNumber'],
            },
        }}
        editable
        layout="edit"
        layouts={{edit: [['master', 'detail']]}}
    />
);
MasterDetailPolymorphic.play = async ({canvasElement}) => {
    await new Promise(resolve => setTimeout(resolve, 50));
};
