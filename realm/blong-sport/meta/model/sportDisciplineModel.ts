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
                // Deletion: reference data other records point at: refuse and name what still uses it.
                deletion: {mode: 'block'},
                classifier: true,
                nameField: 'discipline.disciplineName',
                // A discipline is one of a sport's disciplines. Declaring the parent
                // is the whole page: the navigator lists the sports, the table
                // narrows to the selected sport, and the panel exists because there
                // is a relation to show.
                parent: {object: 'sport', field: 'sportId'},
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
                                disciplineSex: {
                                    title: 'Sex',
                                    // Empty: both sexes contest it, each in its own
                                    // events. `Mixed` is men and women together.
                                    widget: {
                                        options: [
                                            {value: 'male', label: 'Male only'},
                                            {value: 'female', label: 'Female only'},
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
                            'discipline.disciplineSex',
                            'discipline.disciplineStatus',
                            'discipline.inclusionDate',
                            'discipline.sourceName',
                        ],
                    },
                },
                layouts: {edit: [['identity']]},
                browser: {
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
