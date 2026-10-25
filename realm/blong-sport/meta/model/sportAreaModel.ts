import {model} from '@feasibleone/blong';

/** `sportAreaModel` — the expert areas a sports specialist works in. */
export default model(
    () =>
        async function sportAreaModel() {
            return {
                subject: 'sport',
                object: 'area',
                objectTitle: 'Expert Area',
                public: true,
                nameField: 'area.areaName',
                schema: {
                    properties: {
                        area: {
                            properties: {
                                areaName: {title: 'Name', required: true, filter: true},
                                areaStatus: {
                                    title: 'Status',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'active', label: 'Active'},
                                            {value: 'inactive', label: 'Inactive'},
                                        ],
                                    },
                                },
                            },
                            widget: {columns: ['areaName', 'areaStatus']},
                        },
                    },
                },
                cards: {
                    browse: {label: 'Expert Areas', widgets: ['area']},
                    identity: {
                        label: 'Expert Area',
                        widgets: ['area.areaName', 'area.areaStatus'],
                    },
                },
                layouts: {edit: [['identity']]},
                browser: {
                    title: 'Expert Areas',
                    icon: 'pi pi-heart',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/sport.area.new',
                            permission: 'sport.area.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/sport.area.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm: 'Delete the selected expert area?',
                            method: 'sport.area.remove',
                            params: {areaId: '${areaId}'},
                            refresh: true,
                        },
                    ],
                },
            };
        },
);
