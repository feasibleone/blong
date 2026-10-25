import {model} from '@feasibleone/blong';

/** `sportParticipationModel` — an athlete's entry in one edition. */
export default model(
    () =>
        async function sportParticipationModel() {
            return {
                subject: 'sport',
                object: 'participation',
                objectTitle: 'Participation',
                public: true,
                nameField: 'participation.participationFormat',
                schema: {
                    properties: {
                        participation: {
                            properties: {
                                editionId: {
                                    title: 'Edition',
                                    required: true,
                                    widget: {dropdown: 'sport.edition'},
                                },
                                athleteId: {
                                    title: 'Athlete',
                                    required: true,
                                    widget: {dropdown: 'sport.athlete'},
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
                                categoryId: {
                                    title: 'Category',
                                    widget: {dropdown: 'sport.category'},
                                },
                                participationFormat: {
                                    title: 'Format',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'individual', label: 'Individual'},
                                            {value: 'partners', label: 'With Partners'},
                                            {value: 'team', label: 'In a Team'},
                                        ],
                                    },
                                },
                                participationStatus: {
                                    title: 'Status',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'planned', label: 'Planned'},
                                            {value: 'confirmed', label: 'Confirmed'},
                                            {value: 'withdrawn', label: 'Withdrawn'},
                                        ],
                                    },
                                },
                                teamName: {title: 'Team'},
                                partnerName: {title: 'Partner'},
                                participationNote: {title: 'Notes', widget: {type: 'textArea'}},
                            },
                            widget: {
                                columns: [
                                    'editionId',
                                    'athleteId',
                                    'participationFormat',
                                    'participationStatus',
                                ],
                            },
                        },
                    },
                },
                cards: {
                    browse: {label: 'Participations', widgets: ['participation']},
                    identity: {
                        label: 'Participation',
                        widgets: [
                            'participation.editionId',
                            'participation.athleteId',
                            'participation.participationFormat',
                            'participation.participationStatus',
                        ],
                    },
                    classification: {
                        label: 'Competition',
                        widgets: [
                            'participation.sportId',
                            'participation.disciplineId',
                            'participation.categoryId',
                            'participation.teamName',
                            'participation.partnerName',
                            'participation.participationNote',
                        ],
                    },
                },
                layouts: {
                    edit: [['identity'], 'classification'],
                    editThumbIndex: {
                        orientation: 'left',
                        items: [
                            {
                                id: 'identity',
                                label: 'Participation',
                                icon: 'pi pi-users',
                                widgets: ['identity'],
                            },
                            {
                                id: 'classification',
                                label: 'Competition',
                                icon: 'pi pi-tags',
                                widgets: ['classification'],
                            },
                        ],
                    },
                },
                browser: {
                    title: 'Participations',
                    icon: 'pi pi-users',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/sport.participation.new',
                            permission: 'sport.participation.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/sport.participation.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm: 'Delete the selected participation?',
                            method: 'sport.participation.remove',
                            params: {participationId: '${participationId}'},
                            refresh: true,
                        },
                    ],
                },
            };
        },
);
