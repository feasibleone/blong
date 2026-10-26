import {model} from '@feasibleone/blong';

/** `sportResultModel` — the measured outcome of a participation. */
export default model(
    () =>
        async function sportResultModel() {
            return {
                subject: 'sport',
                object: 'result',
                objectTitle: 'Sports Result',
                public: true,
                nameField: 'result.resultValue',
                schema: {
                    properties: {
                        result: {
                            properties: {
                                participationId: {
                                    title: 'Participation',
                                    required: true,
                                    widget: {dropdown: 'sport.participation'},
                                },
                                disciplineId: {
                                    title: 'Discipline',
                                    widget: {dropdown: 'sport.discipline'},
                                },
                                resultKind: {
                                    title: 'Kind',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'ranking', label: 'Ranking'},
                                            {value: 'medal', label: 'Medal'},
                                            {value: 'record', label: 'Record'},
                                            {value: 'standard', label: 'Standard'},
                                            {value: 'achievement', label: 'Achievement'},
                                        ],
                                    },
                                },
                                resultValue: {title: 'Value'},
                                resultUnit: {title: 'Unit'},
                                rankingPlace: {
                                    title: 'Place',
                                    widget: {type: 'integer'},
                                },
                                medalKind: {
                                    title: 'Medal',
                                    widget: {
                                        options: [
                                            {value: 'gold', label: 'Gold'},
                                            {value: 'silver', label: 'Silver'},
                                            {value: 'bronze', label: 'Bronze'},
                                        ],
                                    },
                                },
                                resultStatus: {
                                    title: 'Status',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'preliminary', label: 'Preliminary'},
                                            {value: 'official', label: 'Official'},
                                            {value: 'corrected', label: 'Corrected'},
                                            {value: 'annulled', label: 'Annulled'},
                                        ],
                                    },
                                },
                                resultDate: {title: 'Achieved On', widget: {type: 'date'}},
                                sourceDocumentId: {
                                    title: 'Source Document',
                                    widget: {dropdown: 'sport.document'},
                                },
                                previousResultId: {
                                    title: 'Replaces',
                                    widget: {dropdown: 'sport.result'},
                                },
                                resultNote: {title: 'Notes', widget: {type: 'textArea'}},
                            },
                            widget: {
                                // A row's first column must be readable text: the
                                // id columns render as links and a click on one
                                // opens the record instead of selecting the row.
                                columns: [
                                    'resultKind',
                                    'resultValue',
                                    'resultUnit',
                                    'resultStatus',
                                    'participationId',
                                ],
                            },
                        },
                    },
                },
                cards: {
                    browse: {label: 'Results', widgets: ['result']},
                    result: {
                        label: 'Result',
                        widgets: [
                            'result.participationId',
                            'result.disciplineId',
                            'result.resultKind',
                            'result.resultValue',
                            'result.resultUnit',
                        ],
                    },
                    conditions: {
                        label: 'Conditions',
                        widgets: ['result.rankingPlace', 'result.medalKind', 'result.resultDate'],
                    },
                    source: {
                        label: 'Source and Status',
                        widgets: [
                            'result.resultStatus',
                            'result.sourceDocumentId',
                            'result.previousResultId',
                            'result.resultNote',
                        ],
                    },
                },
                layouts: {
                    edit: [['result'], 'conditions', 'source'],
                    editThumbIndex: {
                        orientation: 'left',
                        items: [
                            {
                                id: 'result',
                                label: 'Result',
                                icon: 'pi pi-flag-fill',
                                widgets: ['result'],
                            },
                            {
                                id: 'conditions',
                                label: 'Conditions',
                                icon: 'pi pi-sliders-h',
                                widgets: ['conditions'],
                            },
                            {
                                id: 'source',
                                label: 'Source',
                                icon: 'pi pi-file',
                                widgets: ['source'],
                            },
                        ],
                    },
                },
                browser: {
                    navigator: false,
                    title: 'Sports Results',
                    icon: 'pi pi-flag-fill',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/sport.result.new',
                            permission: 'sport.result.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/sport.result.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm: 'Delete the selected result?',
                            method: 'sport.result.remove',
                            params: {resultId: '${resultId}'},
                            refresh: true,
                        },
                    ],
                },
            };
        },
);
