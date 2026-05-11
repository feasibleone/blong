import {model} from '@feasibleone/blong';

export default model(
    () =>
        async function marineHabitatModel() {
            return {
                subject: 'marine',
                object: 'habitat',
                objectTitle: 'Habitat',
                nameField: 'habitat.habitatName',

                schema: {
                    properties: {
                        habitat: {
                            widget: {
                                columns: ['habitatName', 'habitatType', 'zone', 'region', 'maxDepth'],
                            },
                            properties: {
                                habitatId: {},
                                habitatName: {title: 'Name', filter: true, sort: true},
                                habitatType: {
                                    title: 'Type',
                                    widget: {
                                        type: 'select',
                                        options: [
                                            {value: 'reef', label: 'Coral Reef'},
                                            {value: 'lagoon', label: 'Lagoon'},
                                            {value: 'atoll', label: 'Atoll'},
                                            {value: 'deepwater', label: 'Deep Water'},
                                            {value: 'seagrass', label: 'Seagrass Bed'},
                                        ],
                                    },
                                },
                                zone: {
                                    title: 'Zone',
                                    filter: true,
                                    widget: {
                                        type: 'select',
                                        options: [
                                            {value: 'shallow', label: 'Shallow Reef (0–30 m)'},
                                            {value: 'mesophotic', label: 'Mesophotic (30–150 m)'},
                                            {value: 'deep', label: 'Deep Water (150+ m)'},
                                            {value: 'lagoon', label: 'Lagoon'},
                                        ],
                                    },
                                },
                                oceanZone: {
                                    title: 'Ocean Zone',
                                    widget: {
                                        type: 'select',
                                        options: [
                                            {value: 'sunlight', label: 'Sunlight Zone (0–200 m)'},
                                            {value: 'twilight', label: 'Twilight Zone (200–1000 m)'},
                                            {value: 'midnight', label: 'Midnight Zone (1000–4000 m)'},
                                            {value: 'abyssal', label: 'Abyssal Zone (4000+ m)'},
                                        ],
                                    },
                                },
                                region: {title: 'Region', filter: true},
                                minDepth: {type: 'number', title: 'Min Depth (m)'},
                                maxDepth: {type: 'number', title: 'Max Depth (m)'},
                                waterTempMin: {type: 'number', title: 'Min Temp (°C)'},
                                waterTempMax: {type: 'number', title: 'Max Temp (°C)'},
                                latitude: {type: 'number', title: 'Latitude'},
                                longitude: {type: 'number', title: 'Longitude'},
                                protectionStatus: {
                                    title: 'Protected Area',
                                    widget: {type: 'boolean'},
                                },
                                description: {title: 'Description', widget: {type: 'textArea'}},
                            },
                        },
                        /** Navigator showing ocean zones for filtering habitats by zone. */
                        navigator: {
                            widget: {
                                listAction: 'marine.habitat.find',
                                keyField: 'habitatId',
                                labelField: 'habitatName',
                            },
                        },
                    },
                },

                cards: {
                    browse: {
                        label: 'Habitat',
                        widgets: ['habitat'],
                    },
                    edit: {
                        label: 'Habitat Details',
                        className: 'col-12 md:col-8',
                        widgets: [
                            'habitat.habitatName',
                            'habitat.habitatType',
                            'habitat.zone',
                            'habitat.oceanZone',
                            'habitat.region',
                            'habitat.description',
                        ],
                    },
                    editCoords: {
                        label: 'Coordinates & Depth',
                        className: 'col-12 md:col-4',
                        widgets: [
                            'habitat.latitude',
                            'habitat.longitude',
                            'habitat.minDepth',
                            'habitat.maxDepth',
                        ],
                    },
                    editTemp: {
                        label: 'Temperature & Protection',
                        widgets: [
                            'habitat.waterTempMin',
                            'habitat.waterTempMax',
                            'habitat.protectionStatus',
                        ],
                    },
                },

                layouts: {
                    edit: ['edit'],
                    editSplit: [['edit', 'editCoords'], 'editTemp'],
                    editThumbIndex: {
                        orientation: 'left',
                        items: [
                            {id: 'details', label: 'Details', icon: 'pi pi-info-circle', widgets: ['edit']},
                            {id: 'coords', label: 'Location', icon: 'pi pi-map', widgets: ['editCoords', 'editTemp']},
                        ],
                    },
                },

                browser: {
                    title: 'Habitat List',
                    icon: 'pi pi-globe',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/marine.habitat.new',
                            permission: 'marine.habitat.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current' as const,
                            method: 'component/marine.habitat.open',
                            params: '${current}',
                        },
                        {
                            label: 'Report',
                            icon: 'pi pi-chart-bar',
                            action: 'component/marine.habitat.report',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected' as const,
                            confirm: 'Delete selected habitat record?',
                            method: 'marine.habitat.remove',
                            params: {habitatId: '${habitatId}'},
                        },
                    ],
                },
            };
        },
);
