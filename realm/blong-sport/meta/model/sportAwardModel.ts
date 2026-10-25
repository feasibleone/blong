import {model} from '@feasibleone/blong';

/** `sportAwardModel` — the reusable award type. @@D-598 */
export default model(
    () =>
        async function sportAwardModel() {
            return {
                subject: 'sport',
                object: 'award',
                objectTitle: 'Award',
                public: true,
                nameField: 'award.awardName',
                schema: {
                    properties: {
                        award: {
                            properties: {
                                awardName: {title: 'Name', required: true, filter: true},
                                awardCategory: {
                                    title: 'Category',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'state', label: 'State'},
                                            {value: 'olympic', label: 'Olympic'},
                                            {value: 'sports', label: 'Sports'},
                                            {value: 'international', label: 'International'},
                                            {value: 'other', label: 'Other'},
                                        ],
                                    },
                                },
                                awardLevel: {
                                    title: 'Class',
                                    widget: {
                                        options: [
                                            {value: 'classI', label: 'Class I'},
                                            {value: 'classII', label: 'Class II'},
                                            {value: 'classIII', label: 'Class III'},
                                            {value: 'badge', label: 'Badge of Honour'},
                                            {value: 'plaque', label: 'Honorary Plaque'},
                                            {value: 'certificate', label: 'Honorary Certificate'},
                                            {value: 'diploma', label: 'Honorary Diploma'},
                                            {value: 'other', label: 'Other'},
                                        ],
                                    },
                                },
                                conferringPartyId: {
                                    title: 'Conferring Body',
                                    widget: {dropdown: 'sport.organization'},
                                },
                                awardStatus: {
                                    title: 'Status',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'active', label: 'Active'},
                                            {value: 'retired', label: 'Retired'},
                                        ],
                                    },
                                },
                                awardNote: {title: 'Notes', widget: {type: 'textArea'}},
                            },
                            widget: {
                                columns: [
                                    'awardName',
                                    'awardCategory',
                                    'awardLevel',
                                    'awardStatus',
                                ],
                            },
                        },
                    },
                },
                cards: {
                    browse: {label: 'Awards', widgets: ['award']},
                    award: {
                        label: 'Award',
                        widgets: [
                            'award.awardName',
                            'award.awardCategory',
                            'award.awardLevel',
                            'award.conferringPartyId',
                            'award.awardStatus',
                            'award.awardNote',
                        ],
                    },
                },
                layouts: {edit: [['award']]},
                browser: {
                    title: 'Awards',
                    icon: 'pi pi-star',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/sport.award.new',
                            permission: 'sport.award.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/sport.award.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm: 'Delete the selected award?',
                            method: 'sport.award.remove',
                            params: {awardId: '${awardId}'},
                            refresh: true,
                        },
                    ],
                },
            };
        },
);
