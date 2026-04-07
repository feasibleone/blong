import type {IModelSpec} from '@feasibleone/blong-browser';

export const habitat: IModelSpec = {
    subject: 'marine',
    object: 'habitat',
    objectTitle: 'Habitat',
    nameField: 'habitat.habitatName',
    schema: {
        properties: {
            habitat: {
                properties: {
                    habitatId: {},
                    habitatName: {title: 'Name', filter: true, sort: true},
                    zone: {
                        title: 'Zone',
                        widget: {
                            type: 'select',
                            options: [
                                {value: 'shallow', label: 'Shallow Reef'},
                                {value: 'deep', label: 'Deep Water'},
                                {value: 'mesophotic', label: 'Mesophotic Zone'},
                                {value: 'lagoon', label: 'Lagoon'},
                            ],
                        },
                    },
                    minDepth: {type: 'number', title: 'Min Depth (m)'},
                    maxDepth: {type: 'number', title: 'Max Depth (m)'},
                    region: {title: 'Region', filter: true},
                    description: {title: 'Description', widget: {type: 'textArea'}},
                },
            },
        },
    },
    cards: {
        browse: {
            label: 'Habitat',
            widgets: ['habitat.habitatName', 'habitat.zone', 'habitat.region', 'habitat.maxDepth'],
        },
        edit: {
            label: 'Habitat Details',
            widgets: [
                'habitat.habitatName',
                'habitat.zone',
                'habitat.region',
                'habitat.minDepth',
                'habitat.maxDepth',
                'habitat.description',
            ],
        },
    },
    browser: {
        title: 'Habitat List',
        icon: 'pi pi-globe',
    },
};
