/**
 * PolymorphicLayout story — blong-ui adaptation.
 *
 * NOTE: Polymorphic card selection based on a type discriminator
 * (`card.match = {type: 'person'}`) is NOT yet implemented
 * in blong-ui. This stub renders a simple flat layout with multiple cards.
 *
 * Snapshot mismatch justification: `card.match` polymorphic card
 * display is not yet implemented in blong-ui.
 */
import type {Meta} from '@storybook/react';
import type {StoryFn} from '../Editor.stories.js';
import {Editor} from '../index.js';

const meta: Meta<typeof Editor> = {
    title: 'Editor/PolymorphicLayout',
    component: Editor,
};
export default meta;

export const PolymorphicLayout: StoryFn = () => (
    <Editor
        schema={{
            properties: {
                name: {title: 'Name'},
                role: {title: 'Role'},
                registrationNumber: {title: 'Registration Number'},
            },
        }}
        cards={{
            editPerson: {label: 'Person', className: 'col-12', widgets: ['name', 'role']},
            editOrganization: {
                label: 'Edit Organization',
                className: 'col-12',
                widgets: ['name', 'registrationNumber'],
            },
        }}
        editable
        editMode
        layout="edit"
        layouts={{edit: ['editPerson', 'editOrganization']}}
    />
);
