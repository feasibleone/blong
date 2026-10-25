import {model} from '@feasibleone/blong';

/** `sportEditionModel` — one edition of a competition (time-bound). @@D-597 */
export default model(
    () =>
        async function sportEditionModel() {
            return {
                subject: 'sport',
                object: 'edition',
                objectTitle: 'Competition Edition',
                public: true,
                nameField: 'edition.editionName',
                schema: {
                    properties: {
                        edition: {
                            properties: {
                                competitionId: {
                                    title: 'Competition',
                                    required: true,
                                    widget: {dropdown: 'sport.competition'},
                                },
                                editionName: {title: 'Edition', required: true, filter: true},
                                editionYear: {
                                    title: 'Year',
                                    required: true,
                                    widget: {type: 'integer'},
                                },
                                startDate: {title: 'Starts', widget: {type: 'date'}},
                                endDate: {title: 'Ends', widget: {type: 'date'}},
                                hostCountryName: {title: 'Country'},
                                hostCityName: {title: 'City'},
                                venueName: {title: 'Venue'},
                                editionStatus: {
                                    title: 'Status',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'planned', label: 'Planned'},
                                            {value: 'running', label: 'Running'},
                                            {value: 'finished', label: 'Finished'},
                                            {value: 'cancelled', label: 'Cancelled'},
                                        ],
                                    },
                                },
                                officialName: {title: 'Official Name'},
                                sourceDocumentId: {
                                    title: 'Source Document',
                                    widget: {dropdown: 'sport.document'},
                                },
                                editionNote: {title: 'Notes', widget: {type: 'textArea'}},
                            },
                            widget: {
                                columns: [
                                    'editionName',
                                    'editionYear',
                                    'hostCountryName',
                                    'editionStatus',
                                ],
                            },
                        },
                    },
                },
                cards: {
                    browse: {label: 'Editions', widgets: ['edition']},
                    identity: {
                        label: 'Edition',
                        widgets: [
                            'edition.competitionId',
                            'edition.editionName',
                            'edition.officialName',
                            'edition.editionYear',
                            'edition.startDate',
                            'edition.endDate',
                            'edition.editionStatus',
                        ],
                    },
                    venue: {
                        label: 'Venue',
                        widgets: [
                            'edition.hostCountryName',
                            'edition.hostCityName',
                            'edition.venueName',
                        ],
                    },
                    organisation: {
                        label: 'Organisation',
                        widgets: ['edition.sourceDocumentId', 'edition.editionNote'],
                    },
                },
                layouts: {
                    edit: [['identity'], 'venue', 'organisation'],
                    editThumbIndex: {
                        orientation: 'left',
                        items: [
                            {
                                id: 'identity',
                                label: 'Edition',
                                icon: 'pi pi-calendar-clock',
                                widgets: ['identity'],
                            },
                            {
                                id: 'venue',
                                label: 'Venue',
                                icon: 'pi pi-map-marker',
                                widgets: ['venue'],
                            },
                            {
                                id: 'organisation',
                                label: 'Source',
                                icon: 'pi pi-file',
                                widgets: ['organisation'],
                            },
                        ],
                    },
                },
                browser: {
                    title: 'Competition Editions',
                    icon: 'pi pi-calendar-clock',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/sport.edition.new',
                            permission: 'sport.edition.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/sport.edition.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm: 'Delete the selected edition?',
                            method: 'sport.edition.remove',
                            params: {editionId: '${editionId}'},
                            refresh: true,
                        },
                    ],
                },
            };
        },
);
