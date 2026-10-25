import {model} from '@feasibleone/blong';

/** `sportSupportModel` — an athlete–specialist period. @@D-600 */
export default model(
    () =>
        async function sportSupportModel() {
            return {
                subject: 'sport',
                object: 'support',
                objectTitle: 'Support Period',
                public: true,
                nameField: 'support.expertRole',
                schema: {
                    properties: {
                        support: {
                            properties: {
                                athleteId: {
                                    title: 'Athlete',
                                    required: true,
                                    widget: {dropdown: 'sport.athlete'},
                                },
                                specialistId: {
                                    title: 'Specialist',
                                    required: true,
                                    widget: {dropdown: 'sport.specialist'},
                                },
                                sportId: {
                                    title: 'Sport',
                                    required: true,
                                    widget: {dropdown: 'sport.sport'},
                                },
                                cycleId: {
                                    title: 'Olympic Cycle',
                                    widget: {dropdown: 'sport.cycle'},
                                },
                                fromDate: {title: 'From', widget: {type: 'date'}},
                                toDate: {title: 'To', widget: {type: 'date'}},
                                expertRole: {
                                    title: 'Role',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'medical', label: 'Medical Provision'},
                                            {value: 'psychological', label: 'Psychological'},
                                            {value: 'recovery', label: 'Recovery'},
                                            {value: 'other', label: 'Other'},
                                        ],
                                    },
                                },
                                linkStatus: {
                                    title: 'Status',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'active', label: 'Active'},
                                            {value: 'completed', label: 'Completed'},
                                            {value: 'historical', label: 'Historical'},
                                        ],
                                    },
                                },
                                basisNote: {title: 'Basis', widget: {type: 'textArea'}},
                                sourceDocumentId: {
                                    title: 'Source Document',
                                    widget: {dropdown: 'sport.document'},
                                },
                            },
                            widget: {
                                columns: [
                                    'athleteId',
                                    'specialistId',
                                    'expertRole',
                                    'fromDate',
                                    'linkStatus',
                                ],
                            },
                        },
                    },
                },
                cards: {
                    browse: {label: 'Support Periods', widgets: ['support']},
                    relationship: {
                        label: 'Relationship',
                        widgets: [
                            'support.athleteId',
                            'support.specialistId',
                            'support.sportId',
                            'support.cycleId',
                            'support.expertRole',
                            'support.linkStatus',
                        ],
                    },
                    period: {
                        label: 'Period and Basis',
                        widgets: [
                            'support.fromDate',
                            'support.toDate',
                            'support.basisNote',
                            'support.sourceDocumentId',
                        ],
                    },
                },
                layouts: {
                    edit: [['relationship'], 'period'],
                    editThumbIndex: {
                        orientation: 'left',
                        items: [
                            {
                                id: 'relationship',
                                label: 'Relationship',
                                icon: 'pi pi-heart',
                                widgets: ['relationship'],
                            },
                            {
                                id: 'period',
                                label: 'Period',
                                icon: 'pi pi-calendar',
                                widgets: ['period'],
                            },
                        ],
                    },
                },
                browser: {
                    title: 'Support Periods',
                    icon: 'pi pi-heart',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/sport.support.new',
                            permission: 'sport.support.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/sport.support.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm: 'Delete the selected support period?',
                            method: 'sport.support.remove',
                            params: {supportId: '${supportId}'},
                            refresh: true,
                        },
                    ],
                },
            };
        },
);
