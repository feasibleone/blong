import {model} from '@feasibleone/blong';

/** `sportSportModel` — the sport classifier. */
export default model(
    () =>
        async function sportSportModel() {
            return {
                subject: 'sport',
                object: 'sport',
                objectTitle: 'Sport',
                public: true,
                nameField: 'sport.sportName',
                schema: {
                    properties: {
                        sport: {
                            properties: {
                                sportName: {title: 'Name', required: true, filter: true},
                                sportIntlName: {title: 'International Name'},
                                sportCode: {title: 'Code'},
                                sportKind: {
                                    title: 'Kind',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'olympic', label: 'Olympic'},
                                            {value: 'nonOlympic', label: 'Non-Olympic'},
                                        ],
                                    },
                                },
                                sportStatus: {
                                    title: 'Status',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'active', label: 'Active'},
                                            {value: 'inactive', label: 'Inactive'},
                                        ],
                                    },
                                },
                                inclusionDate: {title: 'Included On', widget: {type: 'date'}},
                                sourceName: {title: 'Source'},
                            },
                            widget: {
                                columns: ['sportName', 'sportCode', 'sportKind', 'sportStatus'],
                            },
                        },
                    },
                },
                cards: {
                    browse: {label: 'Sports', widgets: ['sport']},
                    identity: {
                        label: 'Sport',
                        widgets: [
                            'sport.sportName',
                            'sport.sportIntlName',
                            'sport.sportCode',
                            'sport.sportKind',
                            'sport.sportStatus',
                            'sport.inclusionDate',
                            'sport.sourceName',
                        ],
                    },
                },
                layouts: {edit: [['identity']]},
                browser: {
                    navigator: false,
                    title: 'Sports',
                    icon: 'pi pi-flag',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/sport.sport.new',
                            permission: 'sport.sport.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/sport.sport.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm: 'Delete the selected sport?',
                            method: 'sport.sport.remove',
                            params: {sportId: '${sportId}'},
                            refresh: true,
                        },
                    ],
                },
            };
        },
);
