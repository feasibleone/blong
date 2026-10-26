import {model} from '@feasibleone/blong';

/** `sportCoachingModel` — an athlete–coach period. @@D-600 */
export default model(
    () =>
        async function sportCoachingModel() {
            return {
                subject: 'sport',
                object: 'coaching',
                objectTitle: 'Coaching Period',
                public: true,
                nameField: 'coaching.coachRole',
                schema: {
                    properties: {
                        coaching: {
                            properties: {
                                athleteId: {
                                    title: 'Athlete',
                                    required: true,
                                    widget: {dropdown: 'sport.athlete'},
                                },
                                coachId: {
                                    title: 'Coach',
                                    required: true,
                                    widget: {dropdown: 'sport.coach'},
                                },
                                sportId: {
                                    title: 'Sport',
                                    required: true,
                                    widget: {dropdown: 'sport.sport'},
                                },
                                disciplineId: {
                                    title: 'Discipline',
                                    widget: {dropdown: 'sport.discipline'},
                                },
                                cycleId: {
                                    title: 'Olympic Cycle',
                                    widget: {dropdown: 'sport.cycle'},
                                },
                                fromDate: {title: 'From', widget: {type: 'date'}},
                                toDate: {title: 'To', widget: {type: 'date'}},
                                coachRole: {
                                    title: 'Role',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'national', label: 'National Coach'},
                                            {value: 'assistant', label: 'Assistant Coach'},
                                            {value: 'personal', label: 'Personal Coach'},
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
                                    'coachId',
                                    'coachRole',
                                    'fromDate',
                                    'linkStatus',
                                ],
                            },
                        },
                    },
                },
                cards: {
                    browse: {label: 'Coaching Periods', widgets: ['coaching']},
                    relationship: {
                        label: 'Relationship',
                        widgets: [
                            'coaching.athleteId',
                            'coaching.coachId',
                            'coaching.sportId',
                            'coaching.disciplineId',
                            'coaching.cycleId',
                            'coaching.coachRole',
                            'coaching.linkStatus',
                        ],
                    },
                    period: {
                        label: 'Period and Basis',
                        widgets: [
                            'coaching.fromDate',
                            'coaching.toDate',
                            'coaching.basisNote',
                            'coaching.sourceDocumentId',
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
                                icon: 'pi pi-user-plus',
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
                    navigator: false,
                    title: 'Coaching Periods',
                    icon: 'pi pi-user-plus',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/sport.coaching.new',
                            permission: 'sport.coaching.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/sport.coaching.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm: 'Delete the selected coaching period?',
                            method: 'sport.coaching.remove',
                            params: {coachingId: '${coachingId}'},
                            refresh: true,
                        },
                    ],
                },
            };
        },
);
