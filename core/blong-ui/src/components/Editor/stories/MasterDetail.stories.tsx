/**
 * MasterDetail story — blong-ui adaptation.
 *
 * NOTE: The Master-Detail pattern (selecting a row in one card populates
 * a detail card) is NOT yet implemented in blong-ui. The target version
 * wires this via `card.watch = '$.selected.tableName'` and a
 * `widget.type = 'table'` with `selectionMode: 'single'`.
 *
 * This stub renders two side-by-side cards.
 * Snapshot mismatch justification: `watch`-based reactive card filling
 * and the `table` widget type are not yet implemented in blong-ui.
 */
import type {Meta} from '@storybook/react';
import type {StoryFn} from '../Editor.stories.js';
import {Editor} from '../index.js';

const meta: Meta<typeof Editor> = {
    title: 'Editor/MasterDetail',
    component: Editor,
};
export default meta;

export const MasterDetail: StoryFn = () => (
    <Editor
        schema={{
            properties: {
                fullName: {title: 'Full Name'},
                nationalId: {title: 'National ID'},
                birthDate: {title: 'Birth Date', type: 'string', format: 'date'},
            },
        }}
        cards={{
            master: {label: 'Persons', className: 'xl:col-2', widgets: ['fullName']},
            detail: {
                label: 'Personal Information',
                className: 'xl:col-3',
                widgets: ['fullName', 'birthDate', 'nationalId'],
            },
        }}
        editable
        layout="edit"
        layouts={{edit: [['master', 'detail']]}}
    />
);
MasterDetail.play = async ({canvasElement}) => {
    await new Promise(resolve => setTimeout(resolve, 50));
};
