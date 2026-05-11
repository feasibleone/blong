import {model} from '@feasibleone/blong';

export default model(
    () =>
        async function marineSpeciesModel() {
            return {
                subject: 'marine',
                object: 'species',
                objectTitle: 'Species',
                nameField: 'species.speciesName',

                schema: {
                    properties: {
                        species: {
                            widget: {
                                columns: ['speciesName', 'scientificName', 'familyId', 'conservationStatus'],
                                /** Filter table rows by the selected navigator family. */
                                master: {familyId: 'familyId'},
                            },
                            properties: {
                                speciesId: {},
                                speciesName: {title: 'Common Name', filter: true, sort: true},
                                scientificName: {title: 'Scientific Name', filter: true},
                                genus: {title: 'Genus'},
                                species: {title: 'Species Epithet'},
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
                                bodyLength: {type: 'number', title: 'Body Length (cm)'},
                                lifespan: {type: 'number', title: 'Lifespan (years)'},
                                diet: {
                                    title: 'Diet',
                                    widget: {
                                        type: 'select',
                                        options: [
                                            {value: 'carnivore', label: 'Carnivore'},
                                            {value: 'herbivore', label: 'Herbivore'},
                                            {value: 'omnivore', label: 'Omnivore'},
                                            {value: 'filter_feeder', label: 'Filter Feeder'},
                                            {value: 'detritivore', label: 'Detritivore'},
                                        ],
                                    },
                                },
                                endangered: {title: 'Endangered', widget: {type: 'boolean'}},
                                description: {title: 'Description', widget: {type: 'textArea'}},
                            },
                        },
                        /** Tree navigator — family list with parent category nodes. */
                        navigator: {
                            widget: {
                                listAction: 'marine.family.find',
                                keyField: 'familyId',
                                parentField: 'parentFamilyId',
                                labelField: 'familyName',
                                listParams: {paging: {pageNumber: 1, pageSize: 100}},
                            },
                        },
                    },
                },

                cards: {
                    browse: {
                        label: 'Species',
                        widgets: ['species'],
                    },
                    edit: {
                        label: 'Species Details',
                        className: 'col-12 md:col-8',
                        widgets: [
                            'species.speciesName',
                            'species.scientificName',
                            'species.genus',
                            'species.species',
                            'species.familyId',
                            'species.conservationStatus',
                            'species.description',
                        ],
                    },
                    editBio: {
                        label: 'Biology',
                        className: 'col-12 md:col-4',
                        widgets: [
                            'species.diet',
                            'species.bodyLength',
                            'species.lifespan',
                            'species.endangered',
                        ],
                    },
                },

                layouts: {
                    edit: ['edit'],
                    editSplit: [['edit', 'editBio']],
                    editThumbIndex: {
                        orientation: 'left',
                        items: [
                            {id: 'taxonomy', label: 'Taxonomy', icon: 'pi pi-book', widgets: ['edit']},
                            {id: 'biology', label: 'Biology', icon: 'pi pi-heart', widgets: ['editBio']},
                        ],
                    },
                },

                browser: {
                    title: 'Species List',
                    icon: 'pi pi-th-large',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/marine.species.new',
                            permission: 'marine.species.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current' as const,
                            method: 'component/marine.species.open',
                            params: '${current}',
                        },
                        {
                            label: 'Report',
                            icon: 'pi pi-chart-bar',
                            action: 'component/marine.species.report',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected' as const,
                            confirm: 'Delete selected species record?',
                            method: 'marine.species.remove',
                            params: {speciesId: '${speciesId}'},
                        },
                    ],
                },
            };
        },
);
