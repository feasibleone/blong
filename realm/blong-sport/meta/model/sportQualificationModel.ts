import {model} from '@feasibleone/blong';

/**
 * `sportQualificationModel` — the Olympic qualification record.
 *
 * One table for now: rules.md VII.1 wants the qualification, the quota and the
 * right of participation apart, and that split is still open with the owner.
 * The quota card carries the TBD label so the UI says so too. @@D-606
 */
export default model(
    () =>
        async function sportQualificationModel() {
            return {
                subject: 'sport',
                object: 'qualification',
                objectTitle: 'Qualification',
                public: true,
                nameField: 'qualification.qualificationKind',
                schema: {
                    properties: {
                        qualification: {
                            properties: {
                                athleteId: {
                                    title: 'Athlete',
                                    required: true,
                                    widget: {dropdown: 'sport.athlete'},
                                },
                                cycleId: {
                                    title: 'Olympic Cycle',
                                    required: true,
                                    widget: {dropdown: 'sport.cycle'},
                                },
                                editionId: {
                                    title: 'Edition',
                                    widget: {dropdown: 'sport.edition'},
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
                                qualificationKind: {
                                    title: 'Kind',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'quota', label: 'Quota'},
                                            {value: 'standard', label: 'Standard'},
                                            {value: 'ranking', label: 'Ranking'},
                                            {value: 'tournament', label: 'Tournament'},
                                            {value: 'decision', label: 'Decision'},
                                        ],
                                    },
                                },
                                qualificationStatus: {
                                    title: 'Status',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'pending', label: 'Pending'},
                                            {value: 'achieved', label: 'Achieved'},
                                            {value: 'confirmed', label: 'Confirmed'},
                                            {value: 'lost', label: 'Lost'},
                                        ],
                                    },
                                },
                                acquiredDate: {title: 'Acquired On', widget: {type: 'date'}},
                                validUntilDate: {title: 'Valid Until', widget: {type: 'date'}},
                                quotaKind: {
                                    title: 'Quota Kind (TBD)',
                                    widget: {
                                        options: [
                                            {value: 'individual', label: 'Individual'},
                                            {value: 'team', label: 'Team'},
                                            {value: 'nonPersonalised', label: 'Non-personalised'},
                                        ],
                                    },
                                },
                                quotaRecipientKind: {
                                    title: 'Quota Recipient (TBD)',
                                    widget: {
                                        options: [
                                            {value: 'athlete', label: 'Athlete'},
                                            {value: 'team', label: 'Team'},
                                            {value: 'noc', label: 'NOC'},
                                            {value: 'country', label: 'Country'},
                                        ],
                                    },
                                },
                                quotaConfirmedDate: {
                                    title: 'Quota Confirmed On (TBD)',
                                    widget: {type: 'date'},
                                },
                                basisNote: {title: 'Basis', widget: {type: 'textArea'}},
                                decisionDocumentId: {
                                    title: 'Decision Document',
                                    widget: {dropdown: 'sport.document'},
                                },
                            },
                            widget: {
                                columns: [
                                    'athleteId',
                                    'cycleId',
                                    'qualificationKind',
                                    'qualificationStatus',
                                    'acquiredDate',
                                ],
                            },
                        },
                    },
                },
                cards: {
                    browse: {label: 'Qualifications', widgets: ['qualification']},
                    identification: {
                        label: 'Qualification',
                        widgets: [
                            'qualification.athleteId',
                            'qualification.cycleId',
                            'qualification.editionId',
                            'qualification.sportId',
                            'qualification.disciplineId',
                            'qualification.categoryId',
                            'qualification.qualificationKind',
                            'qualification.qualificationStatus',
                            'qualification.acquiredDate',
                            'qualification.validUntilDate',
                        ],
                    },
                    quota: {
                        label: 'Quota (TBD)',
                        widgets: [
                            'qualification.quotaKind',
                            'qualification.quotaRecipientKind',
                            'qualification.quotaConfirmedDate',
                        ],
                    },
                    source: {
                        label: 'Basis and Source',
                        widgets: ['qualification.basisNote', 'qualification.decisionDocumentId'],
                    },
                },
                layouts: {
                    edit: [['identification'], 'quota', 'source'],
                    editThumbIndex: {
                        orientation: 'left',
                        items: [
                            {
                                id: 'identification',
                                label: 'Qualification',
                                icon: 'pi pi-check-circle',
                                widgets: ['identification'],
                            },
                            {
                                id: 'quota',
                                label: 'Quota (TBD)',
                                icon: 'pi pi-ticket',
                                widgets: ['quota'],
                            },
                            {
                                id: 'source',
                                label: 'Basis',
                                icon: 'pi pi-file',
                                widgets: ['source'],
                            },
                        ],
                    },
                },
                browser: {
                    title: 'Qualifications',
                    icon: 'pi pi-check-circle',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/sport.qualification.new',
                            permission: 'sport.qualification.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/sport.qualification.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm: 'Delete the selected qualification?',
                            method: 'sport.qualification.remove',
                            params: {qualificationId: '${qualificationId}'},
                            refresh: true,
                        },
                    ],
                },
            };
        },
);
