import {model} from '@feasibleone/blong';

/**
 * `sportDocumentModel` — the generic document table.
 *
 * No sport columns and no sport FK: the table moves to a `blong-document` realm
 * unchanged. @@D-599
 */
export default model(
    () =>
        async function sportDocumentModel() {
            return {
                subject: 'sport',
                object: 'document',
                objectTitle: 'Document',
                public: true,
                nameField: 'document.documentTitle',
                schema: {
                    properties: {
                        document: {
                            properties: {
                                documentTitle: {title: 'Title', required: true, filter: true},
                                documentNumber: {title: 'Number', filter: true},
                                documentType: {
                                    title: 'Type',
                                    widget: {
                                        options: [
                                            {value: 'decision', label: 'Decision'},
                                            {value: 'certificate', label: 'Certificate'},
                                            {value: 'attestation', label: 'Attestation'},
                                            {value: 'protocol', label: 'Protocol'},
                                            {value: 'contract', label: 'Contract'},
                                            {value: 'order', label: 'Order'},
                                            {value: 'other', label: 'Other'},
                                        ],
                                    },
                                },
                                issueDate: {title: 'Issued On', widget: {type: 'date'}},
                                validUntilDate: {title: 'Valid Until', widget: {type: 'date'}},
                                issuerName: {title: 'Issuer'},
                                issuerPartyId: {
                                    title: 'Issuing Organisation',
                                    widget: {dropdown: 'sport.organization'},
                                },
                                documentStatus: {
                                    title: 'Status',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'valid', label: 'Valid'},
                                            {value: 'expired', label: 'Expired'},
                                            {value: 'replaced', label: 'Replaced'},
                                            {value: 'cancelled', label: 'Cancelled'},
                                            {value: 'historical', label: 'Historical'},
                                        ],
                                    },
                                },
                                documentFormat: {title: 'Format'},
                                sourceName: {title: 'Source'},
                                referenceUrl: {title: 'Reference URL'},
                                checksumValue: {title: 'Checksum'},
                                documentNote: {title: 'Notes', widget: {type: 'textArea'}},
                            },
                            widget: {
                                columns: [
                                    'documentTitle',
                                    'documentNumber',
                                    'documentType',
                                    'issueDate',
                                    'documentStatus',
                                ],
                            },
                        },
                    },
                },
                cards: {
                    browse: {label: 'Documents', widgets: ['document']},
                    document: {
                        label: 'Document',
                        widgets: [
                            'document.documentTitle',
                            'document.documentNumber',
                            'document.documentType',
                            'document.issueDate',
                            'document.validUntilDate',
                            'document.documentStatus',
                        ],
                    },
                    content: {
                        label: 'Content',
                        widgets: [
                            'document.documentFormat',
                            'document.referenceUrl',
                            'document.checksumValue',
                        ],
                    },
                    administration: {
                        label: 'Administration',
                        widgets: [
                            'document.issuerName',
                            'document.issuerPartyId',
                            'document.sourceName',
                            'document.documentNote',
                        ],
                    },
                },
                layouts: {
                    edit: [['document'], 'content', 'administration'],
                    editThumbIndex: {
                        orientation: 'left',
                        items: [
                            {
                                id: 'document',
                                label: 'Document',
                                icon: 'pi pi-file',
                                widgets: ['document'],
                            },
                            {
                                id: 'content',
                                label: 'Content',
                                icon: 'pi pi-paperclip',
                                widgets: ['content'],
                            },
                            {
                                id: 'administration',
                                label: 'Administration',
                                icon: 'pi pi-shield',
                                widgets: ['administration'],
                            },
                        ],
                    },
                },
                browser: {
                    navigator: false,
                    title: 'Documents',
                    icon: 'pi pi-file',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/sport.document.new',
                            permission: 'sport.document.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/sport.document.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm: 'Delete the selected document?',
                            method: 'sport.document.remove',
                            params: {documentId: '${documentId}'},
                            refresh: true,
                        },
                    ],
                },
            };
        },
);
