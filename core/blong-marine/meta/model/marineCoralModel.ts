import {model} from '@feasibleone/blong';
import {coralTypeOptions} from '../../data/index.js';

export default model(
    () =>
        async function marineCoralModel() {
            return {
                subject: 'marine',
                object: 'coral',
                objectTitle: 'Coral',
                nameField: 'coral.coralName',

                schema: {
                    properties: {
                        coral: {
                            properties: {
                                coralId: {},
                                coralName: {
                                    title: 'Name',
                                    filter: true,
                                    sort: true,
                                    required: true,
                                },
                                familyId: {
                                    title: 'Family',
                                    widget: {
                                        type: 'dropdown',
                                        dropdown: 'marine.family',
                                        required: true,
                                    },
                                },
                                habitatId: {
                                    title: 'Habitat',
                                    widget: {type: 'dropdown', dropdown: 'marine.habitat'},
                                },
                                coralType: {
                                    title: 'Coral Type',
                                    widget: {
                                        type: 'select',
                                        options: coralTypeOptions,
                                    },
                                },
                                maxDepth: {type: 'number', title: 'Max Depth (m)'},
                                colorPattern: {title: 'Color Pattern'},
                                conservationStatus: {
                                    title: 'Conservation Status',
                                    widget: {
                                        type: 'select',
                                        options: [
                                            {value: 'LC', label: 'Least Concern'},
                                            {value: 'NT', label: 'Near Threatened'},
                                            {value: 'VU', label: 'Vulnerable'},
                                            {value: 'EN', label: 'Endangered'},
                                            {value: 'CR', label: 'Critically Endangered'},
                                        ],
                                    },
                                },
                                endangered: {title: 'Endangered', widget: {type: 'boolean'}},
                                discovered: {title: 'Discovered', widget: {type: 'date'}},
                                description: {title: 'Description', widget: {type: 'textArea'}},
                            },
                            /** Filter the table rows by the selected navigator item (family). */
                            widget: {
                                master: {familyId: 'familyId'},
                                columns: [
                                    'coralName',
                                    'coralType',
                                    'conservationStatus',
                                    'maxDepth',
                                ],
                            },
                        },
                        /** Tree navigator — family list with parent categories for hierarchy. */
                        navigator: {
                            widget: {
                                listAction: 'marine.family.find',
                                keyField: 'familyId',
                                parentField: 'parentFamilyId',
                                labelField: 'familyName',
                                listParams: {paging: {pageNumber: 1, pageSize: 100}},
                            },
                        },
                    },
                },

                cards: {
                    browse: {
                        label: 'Coral',
                        widgets: ['coral'],
                    },
                    detail: {
                        label: '',
                        readOnly: true,
                        watch: '$.selected.coral',
                        widgets: [
                            '$.edit.coral.coralName',
                            '$.edit.coral.coralType',
                            '$.edit.coral.conservationStatus',
                        ],
                    },
                    edit: {
                        label: 'Coral Details',
                        className: 'col-12 md:col-8',
                        widgets: [
                            'coral.coralName',
                            'coral.coralType',
                            'coral.familyId',
                            'coral.habitatId',
                            'coral.maxDepth',
                            'coral.colorPattern',
                            'coral.conservationStatus',
                            'coral.endangered',
                            'coral.discovered',
                            'coral.description',
                        ],
                    },
                    editCompact: {
                        label: 'Coral Details',
                        widgets: [
                            'coral.coralName',
                            'coral.coralType',
                            'coral.familyId',
                            'coral.conservationStatus',
                            'coral.description',
                        ],
                    },
                    editDepth: {
                        label: 'Depth & Habitat',
                        className: 'col-12 md:col-4',
                        widgets: ['coral.habitatId', 'coral.maxDepth', 'coral.colorPattern'],
                    },
                    editTimeline: {
                        label: 'Discovery',
                        widgets: ['coral.discovered'],
                    },
                },

                layouts: {
                    edit: ['edit'],
                    editSplit: [['edit', 'editDepth'], 'editTimeline'],
                    editThumbIndex: {
                        orientation: 'left',
                        items: [
                            {
                                id: 'details',
                                label: 'Details',
                                icon: 'pi pi-info-circle',
                                widgets: ['edit'],
                            },
                            {
                                id: 'habitat',
                                label: 'Habitat & Depth',
                                icon: 'pi pi-globe',
                                widgets: ['editDepth', 'editTimeline'],
                            },
                        ],
                    },
                },

                browser: {
                    icon: 'pi pi-star',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/marine.coral.new',
                            permission: 'marine.coral.add',
                        },
                        {
                            label: 'Create Hard Coral',
                            icon: 'pi pi-plus-circle',
                            action: 'component/marine.coral.new',
                            params: {value: {coral: {coralType: 'hard'}}},
                            permission: 'marine.coral.add',
                        },
                        {
                            label: 'Create Soft Coral',
                            icon: 'pi pi-plus-circle',
                            action: 'component/marine.coral.new',
                            params: {value: {coral: {coralType: 'soft'}}},
                            permission: 'marine.coral.add',
                        },
                        {
                            label: 'Create Template',
                            icon: 'pi pi-plus-circle',
                            action: 'component/marine.coral.new',
                            params: {
                                value: {
                                    coral: {
                                        coralName: 'New Coral',
                                        coralType: 'soft',
                                        colorPattern: 'striped',
                                        maxDepth: 30,
                                        conservationStatus: 'VU',
                                    },
                                },
                            },
                            permission: 'marine.coral.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current' as const,
                            method: 'component/marine.coral.open',
                            params: '${current}',
                        },
                        {
                            label: 'Report',
                            icon: 'pi pi-chart-bar',
                            action: 'component/marine.coral.report',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected' as const,
                            confirm: 'Delete selected coral record?',
                            method: 'marine.coral.remove',
                            params: {coralId: '${coralId}'},
                            refresh: true,
                        },
                    ],
                },
            };
        },
);
