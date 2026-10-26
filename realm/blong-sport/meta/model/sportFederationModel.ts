import {model} from '@feasibleone/blong';

/** `sportFederationModel` — organisation fields + the federation profile. @@D-595 */
export default model(
    () =>
        async function sportFederationModel() {
            return {
                subject: 'sport',
                object: 'federation',
                objectTitle: 'National Sports Federation',
                public: true,
                nameField: 'federation.legalName',
                schema: {
                    properties: {
                        federation: {
                            properties: {
                                legalName: {title: 'Legal Name', required: true, filter: true},
                                federationShortName: {title: 'Short Name'},
                                registrationNumber: {title: 'Registration No'},
                                sportId: {
                                    title: 'Sport',
                                    required: true,
                                    widget: {dropdown: 'sport.sport'},
                                },
                                federationStatus: {
                                    title: 'Status',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'active', label: 'Active'},
                                            {value: 'suspended', label: 'Suspended'},
                                        ],
                                    },
                                },
                                registerIdentifier: {title: 'MYS Register ID'},
                                registerSource: {title: 'Register Source'},
                                federationNote: {title: 'Notes', widget: {type: 'textArea'}},
                            },
                            widget: {
                                columns: [
                                    'legalName',
                                    'federationShortName',
                                    'sportId',
                                    'federationStatus',
                                ],
                            },
                        },
                    },
                },
                cards: {
                    browse: {label: 'Federations', widgets: ['federation']},
                    identity: {
                        label: 'Federation',
                        widgets: [
                            'federation.legalName',
                            'federation.federationShortName',
                            'federation.registrationNumber',
                            'federation.sportId',
                            'federation.federationStatus',
                            'federation.registerIdentifier',
                            'federation.registerSource',
                            'federation.federationNote',
                        ],
                    },
                },
                layouts: {edit: [['identity']]},
                browser: {
                    navigator: false,
                    title: 'Federations',
                    icon: 'pi pi-building',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/sport.federation.new',
                            permission: 'sport.federation.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/sport.federation.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm: 'Delete the selected federation?',
                            method: 'sport.federation.remove',
                            params: {federationId: '${federationId}'},
                            refresh: true,
                        },
                    ],
                },
            };
        },
);
