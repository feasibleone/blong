import {model} from '@feasibleone/blong';

/**
 * `coreTranslationModel` — the display name of a resource per language.
 *
 * The resource picker (`core.translationResource`) lists every resource a
 * dropdown offers, prefixed with its type alias so one picker serves several
 * classifiers. The label and value forms match a dropdown option exactly, so the
 * translated name and the picker cannot disagree (`D-635`).
 */
export default model(
    () =>
        async function coreTranslationModel() {
            return {
                subject: 'core',
                object: 'translation',
                objectTitle: 'Translation',
                subjectTitle: 'Translations',
                public: true,
                nameField: 'translation.translatedName',
                schema: {
                    properties: {
                        translation: {
                            title: 'Resource names',
                            browser: {
                                title: 'Resource names',
                                icon: 'pi pi-tag',
                                permission: {
                                    browse: 'core.translation.browse',
                                    add: 'core.translation.add',
                                    edit: 'core.translation.edit',
                                    delete: 'core.translation.delete',
                                },
                            },
                            properties: {
                                resourceId: {
                                    title: 'Resource',
                                    required: true,
                                    filter: true,
                                    widget: {dropdown: 'core.translationResource'},
                                },
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
                                translatedName: {title: 'Name', required: true},
                                editedAt: {title: 'Edited'},
                            },
                            widget: {
                                columns: [
                                    'resourceId',
                                    'languageCode',
                                    'translatedName',
                                    'editedAt',
                                ],
                            },
                        },
                    },
                },
            };
        },
);
