/**
 * Three cascaded table widgets: selecting a person filters documents by personId,
 * selecting a document filters attachments by documentId.
 * Uses `widget.parent` + `widget.master` for cascaded filtering and `autoSelect: true`
 * to automatically select the first row when the parent selection changes.
 */
import type {Meta} from '@storybook/react-vite';
import type {StoryFn} from '../Editor.stories.js';
import {Editor} from '../index.js';

const meta: Meta<typeof Editor> = {title: 'Editor/CascadedTables', component: Editor};
export default meta;

const cascadedValue = {
    person: [
        {personId: 1, fullName: 'John Doe', birthDate: '2000-01-08', nationalId: '777777777'},
        {personId: 2, fullName: 'Jane Doe', birthDate: '2002-03-18', nationalId: '888888888'},
    ],
    document: [
        {
            documentId: 1,
            personId: 1,
            documentType: 'Passport',
            issueDate: '2020-01-01',
            expiryDate: '2025-01-01',
        },
        {
            documentId: 2,
            personId: 1,
            documentType: 'Driving License',
            issueDate: '2020-01-02',
            expiryDate: '2025-01-02',
        },
        {
            documentId: 3,
            personId: 1,
            documentType: 'Marriage Certificate',
            issueDate: '2020-01-03',
            expiryDate: '2025-01-03',
        },
        {
            documentId: 4,
            personId: 2,
            documentType: 'Passport',
            issueDate: '2020-01-04',
            expiryDate: '2025-01-04',
        },
        {
            documentId: 5,
            personId: 2,
            documentType: 'Driving License',
            issueDate: '2020-01-05',
            expiryDate: '2025-01-05',
        },
    ],
    attachment: [
        {
            attachmentId: 1,
            documentId: 1,
            pageNumber: 1,
            contentType: 'image/jpeg',
            sizeBytes: 12345,
        },
        {
            attachmentId: 2,
            documentId: 1,
            pageNumber: 2,
            contentType: 'image/jpeg',
            sizeBytes: 23456,
        },
        {attachmentId: 3, documentId: 2, pageNumber: 1, contentType: 'image/png', sizeBytes: 33333},
        {attachmentId: 4, documentId: 2, pageNumber: 2, contentType: 'image/png', sizeBytes: 22222},
    ],
};

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
                    items: {
                        properties: {
                            personId: {title: 'ID', readOnly: true},
                            fullName: {title: 'Full Name'},
                            nationalId: {title: 'National ID'},
                            birthDate: {title: 'Birth Date'},
                        },
                    },
                },
                document: {
                    title: '',
                    type: 'array',
                    widget: {
                        type: 'table',
                        selectionMode: 'single',
                        columns: ['documentType', 'issueDate', 'expiryDate'],
                        parent: 'person',
                        master: {personId: 'personId'},
                        autoSelect: true,
                    },
                    items: {
                        properties: {
                            documentId: {title: 'ID', readOnly: true},
                            personId: {title: 'Person ID', readOnly: true},
                            documentType: {title: 'Document Type'},
                            issueDate: {title: 'Issue Date'},
                            expiryDate: {title: 'Expiry Date'},
                        },
                    },
                },
                attachment: {
                    title: '',
                    type: 'array',
                    widget: {
                        type: 'table',
                        selectionMode: 'single',
                        columns: ['pageNumber', 'contentType', 'sizeBytes'],
                        parent: 'document',
                        master: {documentId: 'documentId'},
                        autoSelect: true,
                    },
                    items: {
                        properties: {
                            attachmentId: {title: 'ID', readOnly: true},
                            documentId: {title: 'Document ID', readOnly: true},
                            pageNumber: {title: 'Page'},
                            contentType: {title: 'Content Type'},
                            sizeBytes: {title: 'Size (bytes)'},
                        },
                    },
                },
            },
        }}
        cards={{
            person: {label: 'Person', className: 'col-12 md:col-4', widgets: ['person']},
            document: {label: 'Document', className: 'col-12 md:col-4', widgets: ['document']},
            attachment: {
                label: 'Attachment',
                className: 'col-12 md:col-4',
                widgets: ['attachment'],
            },
        }}
        value={cascadedValue}
        editable
        editMode
        layout="edit"
        layouts={{edit: ['person', 'document', 'attachment']}}
    />
);

CascadedTables.play = async ({canvas, userEvent}) => {
    const johnRow = await canvas.findByText('John Doe');
    await userEvent.click(johnRow);
    await new Promise(resolve => setTimeout(resolve, 200));
    const drivingRow = canvas.getByText('Driving License');
    await userEvent.click(drivingRow);
    await new Promise(resolve => setTimeout(resolve, 200));
};
