import type {IModelSpec} from '@feasibleone/blong-ui';

export const family: IModelSpec = {
    subject: 'marine',
    object: 'family',
    objectTitle: 'Family',
    nameField: 'family.familyName',
    schema: {
        properties: {
            family: {
                properties: {
                    familyId: {},
                    familyName: {title: 'Family Name', filter: true, sort: true},
                    order: {title: 'Order'},
                    class: {title: 'Class'},
                    description: {title: 'Description', widget: {type: 'textArea'}},
                },
            },
        },
    },
    cards: {
        browse: {
            label: 'Family',
            widgets: ['family.familyName', 'family.order', 'family.class'],
        },
        edit: {
            label: 'Family Details',
            widgets: ['family.familyName', 'family.order', 'family.class', 'family.description'],
        },
    },
    browser: {
        title: 'Family List',
        icon: 'pi pi-sitemap',
    },
};
