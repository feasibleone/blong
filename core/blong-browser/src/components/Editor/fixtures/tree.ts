import type {ICardConfig, IEnrichedSchema} from '../../../types/widget.js';

export interface ITreeFixture {
    schema: IEnrichedSchema;
    cards: Record<string, ICardConfig>;
}

const tree: ITreeFixture = {
    schema: {
        properties: {
            treeId: {},
            treeName: {
                title: 'Name',
                required: true,
            },
            treeDescription: {
                title: 'Description',
                widget: {
                    type: 'text',
                },
            },
            treeType: {
                title: 'Type',
                widget: {
                    type: 'dropdown',
                    dropdown: 'tree.type',
                },
            },
            seedDescription: {
                title: 'Seed',
            },
            maleCone: {
                title: 'Male Cone',
            },
            femaleCone: {
                title: 'Female Cone',
            },
            flowerDescription: {
                title: 'Flower',
            },
            fruitName: {
                title: 'Fruit',
            },
            mock: {
                title: 'Mock Field',
            },
            habitat: {
                title: '',
                widget: {
                    type: 'multiSelectPanel',
                    dropdown: 'tree.habitat',
                },
            },
            createdOn: {
                type: 'string',
                format: 'date',
                readOnly: true,
                title: 'Created On',
            },
            links: {
                title: '',
                widget: {
                    type: 'table',
                    label: 'Links',
                    columns: ['title', 'url'],
                },
                items: {
                    properties: {
                        title: {filter: true},
                        url: {filter: true, sort: true},
                    },
                },
            },
        },
    },
    cards: {
        edit: {
            label: 'Tree',
            widgets: ['treeName', 'treeDescription', 'treeType'],
        },
        denied: {
            label: 'Permission Denied',
            permission: 'denied',
            widgets: [],
        },
        reproduction: {
            label: 'Reproduction',
            widgets: ['seedDescription', 'flowerDescription', 'fruitName'],
        },
        taxonomy: {
            label: 'Taxonomy',
            widgets: [],
        },
        morphology: {
            label: 'Morphology',
            widgets: ['maleCone', 'femaleCone'],
        },
        habitat: {
            label: 'Habitat',
            widgets: ['habitat'],
        },
        system: {
            label: 'System',
            widgets: ['createdOn'],
        },
        links: {
            label: undefined,
            widgets: ['links'],
        },
    },
};

export default tree;
