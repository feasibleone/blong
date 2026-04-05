/**
 * Selecting a person in the master table populates the editable detail card.
 * The master table uses selectionMode: 'single' with allowEdit: false (no row-edit buttons).
 * The detail card uses watch: '$.selected.person' with '$.edit.person.*' widget names.
 */
import type {Meta} from '@storybook/react';
import {within} from '@testing-library/react';
import {userEvent} from '@testing-library/user-event';
import type {StoryFn} from '../Editor.stories.js';
import {Editor} from '../index.js';

const meta: Meta<typeof Editor> = {title: 'Editor/MasterDetail', component: Editor};
export default meta;

const personValue = {
    person: [
        {personId: 1, fullName: 'John Doe', birthDate: '2000-01-08', nationalId: '777777777'},
        {personId: 2, fullName: 'Jane Doe', birthDate: '2002-03-18', nationalId: '888888888'},
        {personId: 3, fullName: 'Alice Smith', birthDate: '1995-06-12', nationalId: '123456789'},
    ],
};

export const MasterDetail: StoryFn = () => (
    <Editor
        schema={{
            properties: {
                person: {
                    title: '',
                    type: 'array',
                    widget: {
                        type: 'table',
                        selectionMode: 'single',
                        actions: {allowEdit: false},
                        columns: ['fullName', 'nationalId'],
                    },
                    items: {
                        properties: {
                            personId: {title: 'ID', readOnly: true},
                            fullName: {title: 'Full Name', required: true},
                            nationalId: {title: 'National ID'},
                            birthDate: {title: 'Birth Date', format: 'date'},
                        },
                    },
                },
            },
        }}
        cards={{
            master: {
                label: 'Persons',
                className: 'col-12 md:col-4',
                widgets: ['person'],
            },
            detail: {
                label: 'Personal Information',
                className: 'col-12 md:col-5',
                watch: '$.selected.person',
                widgets: [
                    '$.edit.person.fullName',
                    '$.edit.person.birthDate',
                    '$.edit.person.nationalId',
                ],
            },
        }}
        value={personValue}
        editable
        editMode
        layout="edit"
        layouts={{edit: ['master', 'detail']}}
    />
);

MasterDetail.play = async ({canvasElement}) => {
    const canvas = within(canvasElement);
    const johnRow = await canvas.findByText('John Doe');
    await userEvent.click(johnRow);
    await new Promise(resolve => setTimeout(resolve, 200));
};
