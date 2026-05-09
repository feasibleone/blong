import {model} from '@feasibleone/blong';

export default model(
    () =>
        async function marineCoralModel() {
            return {
                subject: 'marine',
                object: 'coral',
                objectTitle: 'Coral',
                nameField: 'coral.coralName',
                schema: {
                    properties: {
                        coral: {
                            properties: {
                                coralId: {},
                                coralName: {title: 'Name', filter: true, sort: true},
                                familyId: {
                                    title: 'Family',
                                    widget: {type: 'dropdown', dropdown: 'marine.family'},
                                },
                                habitatId: {
                                    title: 'Habitat',
                                    widget: {type: 'dropdown', dropdown: 'marine.habitat'},
                                },
                                maxDepth: {type: 'number', title: 'Max Depth (m)'},
                                colorPattern: {title: 'Color Pattern'},
                                discovered: {title: 'Discovered', widget: {type: 'date'}},
                                description: {title: 'Description', widget: {type: 'textArea'}},
                            },
                            widget: {
                                master: {familyId: 'familyId'},
                            },
                        },
                        navigator: {
                            widget: {
                                listAction: 'marine.family.find',
                                keyField: 'familyId',
                                // parentField: 'parentFamilyId',
                                labelField: 'familyName',
                            },
                        },
                    },
                },
                cards: {
                    edit: {
                        label: 'Coral Details',
                        widgets: [
                            'coral.coralName',
                            'coral.familyId',
                            'coral.habitatId',
                            'coral.maxDepth',
                            'coral.colorPattern',
                            'coral.discovered',
                            'coral.description',
                        ],
                    },
                },
            };
        },
);
