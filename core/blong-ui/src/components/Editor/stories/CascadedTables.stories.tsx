/**
 * CascadedTables story — blong-ui adaptation.
 *
 * Three cascaded table widgets: selecting a person filters documents,
 * selecting a document filters attachments.
 */
import type {Meta} from '@storybook/react';
import type {StoryFn} from '../Editor.stories.js';
import {Editor} from '../index.js';

const meta: Meta<typeof Editor> = {
    title: 'Editor/CascadedTables',
    component: Editor,
};
export default meta;

export const CascadedTables: StoryFn = () => (
    <Editor
        schema={{
            properties: {
                person: {
                    title: '',
                    type: 'array',
                    widget: {
                        type: 'table',
                        selectionMode: 'single',
                        columns: ['fullName', 'nationalId', 'birthDate'],
                    },
                },
                document: {
                    title: '',
                    type: 'array',
                    widget: {
                        type: 'table',
                        selectionMode: 'single',
                        columns: ['documentType', 'issueDate', 'expiryDate'],
                    },
                },
                attachment: {
                    title: '',
                    type: 'array',
                    widget: {
                        type: 'table',
                        selectionMode: 'single',
                        columns: ['pageNumber', 'contentType', 'sizeBytes'],
                    },
                },
            },
        }}
        cards={{
            person: {label: 'Person', widgets: ['person']},
            document: {label: 'Document', widgets: ['document']},
            attachment: {label: 'Attachment', widgets: ['attachment']},
        }}
        editable
        layout="edit"
        layouts={{edit: [['person', 'document', 'attachment']]}}
    />
);
CascadedTables.play = async ({canvasElement: _el}) => {
    await new Promise(resolve => setTimeout(resolve, 50));
};
