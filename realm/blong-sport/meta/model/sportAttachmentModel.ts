import {model} from '@feasibleone/blong';

/** `sportAttachmentModel` — attaches a document to a person or organisation. */
export default model(
    () =>
        async function sportAttachmentModel() {
            return {
                subject: 'sport',
                object: 'attachment',
                objectTitle: 'Document Attachment',
                public: true,
                nameField: 'attachment.attachmentRole',
                schema: {
                    properties: {
                        attachment: {
                            properties: {
                                documentId: {
                                    title: 'Document',
                                    required: true,
                                    widget: {dropdown: 'sport.document'},
                                },
                                targetResourceId: {
                                    title: 'Attached To',
                                    required: true,
                                    widget: {dropdown: 'sport.recipient'},
                                },
                                attachmentRole: {
                                    title: 'Role',
                                    widget: {
                                        options: [
                                            {value: 'proof', label: 'Proof'},
                                            {value: 'photo', label: 'Photograph'},
                                            {value: 'decision', label: 'Decision'},
                                            {value: 'other', label: 'Other'},
                                        ],
                                    },
                                },
                                attachmentNote: {title: 'Note', widget: {type: 'textArea'}},
                                attachedDate: {title: 'Attached On', widget: {type: 'date'}},
                            },
                            widget: {
                                columns: [
                                    'documentId',
                                    'targetResourceId',
                                    'attachmentRole',
                                    'attachedDate',
                                ],
                            },
                        },
                    },
                },
                cards: {
                    browse: {label: 'Attachments', widgets: ['attachment']},
                    attachment: {
                        label: 'Attachment',
                        widgets: [
                            'attachment.documentId',
                            'attachment.targetResourceId',
                            'attachment.attachmentRole',
                            'attachment.attachedDate',
                            'attachment.attachmentNote',
                        ],
                    },
                },
                layouts: {edit: [['attachment']]},
                browser: {
                    title: 'Attachments',
                    icon: 'pi pi-paperclip',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/sport.attachment.new',
                            permission: 'sport.attachment.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/sport.attachment.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm: 'Delete the selected attachment?',
                            method: 'sport.attachment.remove',
                            params: {attachmentId: '${attachmentId}'},
                            refresh: true,
                        },
                    ],
                },
            };
        },
);
