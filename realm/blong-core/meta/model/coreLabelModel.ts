import {model} from '@feasibleone/blong';

/**
 * `coreLabelModel` — the UI-label dictionary, one row per key and language.
 *
 * The key is the English string a component renders (`D-625`). Editing a row
 * stamps `editorId` with the caller, which is what stops a later seed run from
 * replacing it (`D-626`). Registered with the other model pages, so it needs no
 * bespoke page code.
 */
export default model(
    () =>
        async function coreLabelModel() {
            return {
                subject: 'core',
                object: 'label',
                objectTitle: 'Label',
                subjectTitle: 'Translations',
                public: true,
                nameField: 'label.labelKey',
                schema: {
                    properties: {
                        label: {
                            title: 'Labels',
                            browser: {
                                title: 'Labels',
                                icon: 'pi pi-language',
                                permission: {
                                    browse: 'core.label.browse',
                                    add: 'core.label.add',
                                    edit: 'core.label.edit',
                                    delete: 'core.label.delete',
                                },
                            },
                            properties: {
                                labelKey: {title: 'Key', required: true, filter: true},
                                languageCode: {
                                    title: 'Language',
                                    required: true,
                                    filter: true,
                                    widget: {
                                        options: [
                                            {value: 'en', label: 'English'},
                                            {value: 'bg', label: 'Bulgarian'},
                                        ],
                                    },
                                },
                                labelText: {title: 'Text', widget: {type: 'textArea'}},
                                editedAt: {title: 'Edited'},
                            },
                            widget: {
                                columns: ['labelKey', 'languageCode', 'labelText', 'editedAt'],
                            },
                        },
                    },
                },
            };
        },
);
