import {model} from '@feasibleone/blong';

/** `sportAffiliationModel` — club and federation membership periods. */
export default model(
    () =>
        async function sportAffiliationModel() {
            return {
                subject: 'sport',
                object: 'affiliation',
                objectTitle: 'Affiliation Period',
                public: true,
                nameField: 'affiliation.affiliationKind',
                schema: {
                    properties: {
                        affiliation: {
                            properties: {
                                personResourceId: {
                                    title: 'Person',
                                    required: true,
                                    widget: {dropdown: 'sport.recipient'},
                                },
                                organisationId: {
                                    title: 'Organisation',
                                    required: true,
                                    widget: {dropdown: 'sport.organization'},
                                },
                                affiliationKind: {
                                    title: 'Kind',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'club', label: 'Club'},
                                            {value: 'federation', label: 'Federation'},
                                        ],
                                    },
                                },
                                fromDate: {title: 'From', widget: {type: 'date'}},
                                toDate: {title: 'To', widget: {type: 'date'}},
                                affiliationStatus: {
                                    title: 'Status',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'active', label: 'Active'},
                                            {value: 'completed', label: 'Completed'},
                                        ],
                                    },
                                },
                                basisNote: {title: 'Basis', widget: {type: 'textArea'}},
                            },
                            widget: {
                                columns: [
                                    'personResourceId',
                                    'organisationId',
                                    'affiliationKind',
                                    'fromDate',
                                    'affiliationStatus',
                                ],
                            },
                        },
                    },
                },
                cards: {
                    browse: {label: 'Affiliations', widgets: ['affiliation']},
                    affiliation: {
                        label: 'Affiliation',
                        widgets: [
                            'affiliation.personResourceId',
                            'affiliation.organisationId',
                            'affiliation.affiliationKind',
                            'affiliation.affiliationStatus',
                        ],
                    },
                    period: {
                        label: 'Period',
                        widgets: [
                            'affiliation.fromDate',
                            'affiliation.toDate',
                            'affiliation.basisNote',
                        ],
                    },
                },
                layouts: {
                    edit: [['affiliation'], 'period'],
                    editThumbIndex: {
                        orientation: 'left',
                        items: [
                            {
                                id: 'affiliation',
                                label: 'Affiliation',
                                icon: 'pi pi-link',
                                widgets: ['affiliation'],
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
                    title: 'Affiliations',
                    icon: 'pi pi-link',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/sport.affiliation.new',
                            permission: 'sport.affiliation.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/sport.affiliation.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm: 'Delete the selected affiliation?',
                            method: 'sport.affiliation.remove',
                            params: {affiliationId: '${affiliationId}'},
                            refresh: true,
                        },
                    ],
                },
            };
        },
);
