import type {IModelSpec} from '@feasibleone/blong-browser';

export const species: IModelSpec = {
    subject: 'marine',
    object: 'species',
    objectTitle: 'Species',
    nameField: 'species.speciesName',
    schema: {
        properties: {
            species: {
                properties: {
                    speciesId: {},
                    speciesName: {title: 'Scientific Name', filter: true, sort: true},
                    commonName: {title: 'Common Name', filter: true},
                    familyId: {
                        title: 'Family',
                        widget: {type: 'dropdown', dropdown: 'marine.family'},
                    },
                    conservationStatus: {
                        title: 'Conservation Status',
                        widget: {
                            type: 'select',
                            options: [
                                {value: 'LC', label: 'Least Concern'},
                                {value: 'NT', label: 'Near Threatened'},
                                {value: 'VU', label: 'Vulnerable'},
                                {value: 'EN', label: 'Endangered'},
                                {value: 'CR', label: 'Critically Endangered'},
                            ],
                        },
                    },
                    description: {title: 'Description', widget: {type: 'textArea'}},
                },
            },
        },
    },
    cards: {
        browse: {
            label: 'Species',
            widgets: [
                'species.speciesName',
                'species.commonName',
                'species.familyId',
                'species.conservationStatus',
            ],
        },
        edit: {
            label: 'Species Details',
            widgets: [
                'species.speciesName',
                'species.commonName',
                'species.familyId',
                'species.conservationStatus',
                'species.description',
            ],
        },
    },
    browser: {
        title: 'Species List',
        icon: 'pi pi-th-large',
    },
};
