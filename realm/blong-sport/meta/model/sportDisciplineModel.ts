import {model} from '@feasibleone/blong';

/** `sportDisciplineModel` — disciplines of a sport. */
export default model(
    () =>
        async function sportDisciplineModel() {
            return {
                subject: 'sport',
                object: 'discipline',
                objectTitle: 'Discipline',
                public: true,
                nameField: 'discipline.disciplineName',
                schema: {
                    properties: {
                        discipline: {
                            properties: {
                                disciplineName: {title: 'Name', required: true, filter: true},
                                disciplineIntlName: {title: 'International Name'},
                                disciplineCode: {title: 'Code'},
                                disciplineKind: {
                                    title: 'Kind',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'individual', label: 'Individual'},
                                            {value: 'team', label: 'Team'},
                                            {value: 'mixed', label: 'Mixed'},
                                        ],
                                    },
                                },
                                disciplineStatus: {
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
                                    widget: {dropdown: 'sport.sport'},
                                },
                                inclusionDate: {title: 'Included On', widget: {type: 'date'}},
                                sourceName: {title: 'Source'},
                            },
                            widget: {
                                columns: [
                                    'disciplineName',
                                    'sportId',
                                    'disciplineKind',
                                    'disciplineStatus',
                                ],
                            },
                        },
                    },
                },
                cards: {
                    browse: {label: 'Disciplines', widgets: ['discipline']},
                    identity: {
                        label: 'Discipline',
                        widgets: [
                            'discipline.disciplineName',
                            'discipline.disciplineIntlName',
                            'discipline.disciplineCode',
                            'discipline.sportId',
                            'discipline.disciplineKind',
                            'discipline.disciplineStatus',
                            'discipline.inclusionDate',
                            'discipline.sourceName',
                        ],
                    },
                },
                layouts: {edit: [['identity']]},
                browser: {
                    navigator: false,
                    title: 'Disciplines',
                    icon: 'pi pi-sitemap',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/sport.discipline.new',
                            permission: 'sport.discipline.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/sport.discipline.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm: 'Delete the selected discipline?',
                            method: 'sport.discipline.remove',
                            params: {disciplineId: '${disciplineId}'},
                            refresh: true,
                        },
                    ],
                },
            };
        },
);
