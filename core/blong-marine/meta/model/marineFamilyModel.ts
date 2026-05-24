import {model} from '@feasibleone/blong';

export default model(
    () =>
        async function marineFamilyModel() {
            return {
                subject: 'marine',
                object: 'family',
                objectTitle: 'Family',
                nameField: 'family.familyName',

                schema: {
                    properties: {
                        family: {
                            properties: {
                                familyId: {},
                                familyName: {title: 'Family Name', filter: true, sort: true},
                                parentFamilyId: {title: 'Parent Group', type: 'number'},
                                order: {title: 'Order'},
                                class: {title: 'Class'},
                                description: {title: 'Description', widget: {type: 'textArea'}},
                            },
                            widget: {
                                columns: ['familyName', 'order', 'class'],
                            },
                        },
                    },
                },

                cards: {
                    browse: {
                        label: 'Family',
                        widgets: ['family'],
                    },
                    edit: {
                        label: 'Family Details',
                        widgets: [
                            'family.familyName',
                            'family.order',
                            'family.class',
                            'family.description',
                        ],
                    },
                    editFull: {
                        label: 'Full Details',
                        widgets: [
                            'family.familyName',
                            'family.parentFamilyId',
                            'family.order',
                            'family.class',
                            'family.description',
                        ],
                    },
                },

                layouts: {
                    edit: ['edit'],
                    editFull: ['editFull'],
                },

                browser: {
                    icon: 'pi pi-sitemap',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/marine.family.new',
                            permission: 'marine.family.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current' as const,
                            method: 'component/marine.family.open',
                            params: '${current}',
                        },
                        {
                            label: 'Report',
                            icon: 'pi pi-chart-bar',
                            action: 'component/marine.family.report',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected' as const,
                            confirm: 'Delete selected family record?',
                            method: 'marine.family.remove',
                            params: {familyId: '${familyId}'},
                        },
                    ],
                },
            };
        },
);
