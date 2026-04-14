import {model} from '@feasibleone/blong';

export default model(() => ({
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
}));
