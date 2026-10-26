import {model} from '@feasibleone/blong';

/**
 * `sportCompetitionModel` — the recurring competition and its editions.
 *
 * model.md's "Sports Event" is two objects here: the named series (this one, a
 * resource) and its time-bound edition. @@D-597 The `editions` card lists the
 * editions of this competition; `sportCompetitionGet` supplies the array, the
 * generic get for a resource-backed table cannot.
 */
export default model(
    () =>
        async function sportCompetitionModel() {
            return {
                subject: 'sport',
                object: 'competition',
                objectTitle: 'Competition',
                public: true,
                nameField: 'competition.competitionName',
                schema: {
                    properties: {
                        competition: {
                            properties: {
                                competitionName: {title: 'Name', required: true, filter: true},
                                competitionIntlName: {title: 'International Name'},
                                competitionKind: {
                                    title: 'Kind',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'olympicGames', label: 'Olympic Games'},
                                            {
                                                value: 'worldChampionship',
                                                label: 'World Championship',
                                            },
                                            {
                                                value: 'europeanChampionship',
                                                label: 'European Championship',
                                            },
                                            {value: 'worldCup', label: 'World Cup'},
                                            {value: 'qualification', label: 'Qualification'},
                                            {value: 'national', label: 'National'},
                                            {value: 'international', label: 'International'},
                                            {value: 'other', label: 'Other'},
                                        ],
                                    },
                                },
                                competitionStatus: {
                                    title: 'Status',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'active', label: 'Active'},
                                            {value: 'inactive', label: 'Inactive'},
                                        ],
                                    },
                                },
                                sportId: {
                                    title: 'Sport',
                                    required: true,
                                    // The row carries `sportName` from the join, so the
                                    // table renders it and no cell looks the key up.
                                    // @@D-614
                                    widget: {dropdown: 'sport.sport', body: 'sportName'},
                                },
                                disciplineId: {
                                    title: 'Discipline',
                                    widget: {dropdown: 'sport.discipline'},
                                },
                                organiserPartyId: {
                                    title: 'Organiser',
                                    widget: {dropdown: 'sport.organization'},
                                },
                                federationId: {
                                    title: 'Federation',
                                    widget: {dropdown: 'sport.federation'},
                                },
                                sourceName: {title: 'Source'},
                            },
                            widget: {
                                columns: [
                                    'competitionName',
                                    'competitionKind',
                                    'sportId',
                                    'competitionStatus',
                                ],
                            },
                        },
                        /** Editions of this competition — read-only on the competition page. */
                        editions: {
                            title: 'Editions',
                            items: {
                                properties: {
                                    editionName: {title: 'Edition'},
                                    editionYear: {title: 'Year'},
                                    hostCountryName: {title: 'Country'},
                                    editionStatus: {title: 'Status'},
                                },
                            },
                            widget: {
                                type: 'table',
                                columns: ['editionName', 'editionYear', 'hostCountryName'],
                                actions: {allowAdd: false, allowEdit: false, allowDelete: false},
                            },
                        },
                    },
                },
                cards: {
                    browse: {label: 'Competitions', widgets: ['competition']},
                    identity: {
                        label: 'Competition',
                        widgets: [
                            'competition.competitionName',
                            'competition.competitionIntlName',
                            'competition.competitionKind',
                            'competition.competitionStatus',
                        ],
                    },
                    classification: {
                        label: 'Classification and Organisation',
                        widgets: [
                            'competition.sportId',
                            'competition.disciplineId',
                            'competition.organiserPartyId',
                            'competition.federationId',
                            'competition.sourceName',
                        ],
                    },
                    editionsCard: {
                        label: 'Editions',
                        // A child list is a table: it keeps the full row even though
                        // the field cards beside it default to half width.
                        className: 'col-12',
                        readOnly: true,
                        widgets: ['editions'],
                    },
                },
                layouts: {
                    edit: [['identity'], 'classification'],
                    editThumbIndex: {
                        orientation: 'left',
                        items: [
                            {
                                id: 'identity',
                                label: 'Competition',
                                icon: 'pi pi-calendar-plus',
                                widgets: ['identity'],
                            },
                            {
                                id: 'classification',
                                label: 'Classification',
                                icon: 'pi pi-tags',
                                widgets: ['classification'],
                            },
                            {
                                id: 'editions',
                                label: 'Editions',
                                icon: 'pi pi-calendar-clock',
                                widgets: ['editionsCard'],
                            },
                        ],
                    },
                },
                browser: {
                    navigator: false,
                    title: 'Competitions',
                    icon: 'pi pi-calendar-plus',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/sport.competition.new',
                            permission: 'sport.competition.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/sport.competition.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm: 'Delete the selected competition?',
                            method: 'sport.competition.remove',
                            params: {competitionId: '${competitionId}'},
                            refresh: true,
                        },
                    ],
                },
            };
        },
);
