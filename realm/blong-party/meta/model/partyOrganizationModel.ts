import {model} from '@feasibleone/blong';

export default model(
    () =>
        async function partyOrganizationModel() {
            return {
                subject: 'party',
                object: 'organization',
                objectTitle: 'Organization',
                public: true,
                nameField: 'organization.legalName',

                schema: {
                    properties: {
                        organization: {
                            properties: {
                                legalName: {title: 'Legal Name'},
                                tradingName: {title: 'Trading Name'},
                                registrationNumber: {title: 'Registration Number'},
                                taxId: {title: 'Tax ID'},
                                establishedDate: {title: 'Date Established'},
                                industry: {title: 'Industry', filter: true},
                                website: {title: 'Website'},
                                notes: {title: 'Notes'},
                                // server schema defined
                                // organizationId: {},
                            },
                            widget: {
                                columns: [
                                    'legalName',
                                    'industry',
                                    'registrationNumber',
                                    'establishedDate',
                                ],
                            },
                        },
                        /** Contact details card. */
                        contact: {
                            properties: {
                                contactType: {
                                    title: 'Contact Type',
                                    widget: {
                                        options: [
                                            {value: 'email', label: 'Email'},
                                            {value: 'phone', label: 'Phone'},
                                            {value: 'mobile', label: 'Mobile'},
                                            {value: 'fax', label: 'Fax'},
                                        ],
                                    },
                                },
                                contactValue: {title: 'Contact Value'},
                                isPrimary: {title: 'Primary'},
                            },
                            widget: {
                                columns: ['contactType', 'contactValue', 'isPrimary'],
                            },
                        },
                        /** Address card. */
                        address: {
                            properties: {
                                addressType: {
                                    title: 'Address Type',
                                    widget: {
                                        options: [
                                            {value: 'home', label: 'Home'},
                                            {value: 'work', label: 'Work'},
                                            {value: 'billing', label: 'Billing'},
                                            {value: 'shipping', label: 'Shipping'},
                                        ],
                                    },
                                },
                                streetAddress: {title: 'Street Address'},
                                city: {title: 'City'},
                                stateProvince: {title: 'State / Province'},
                                postalCode: {title: 'Postal Code'},
                                isPrimary: {title: 'Primary'},
                            },
                            widget: {
                                columns: ['addressType', 'streetAddress', 'city', 'isPrimary'],
                            },
                        },
                        /** Identifier card. */
                        identifier: {
                            properties: {
                                identifierType: {
                                    title: 'Identifier Type',
                                    widget: {
                                        options: [
                                            {value: 'taxId', label: 'Tax ID'},
                                            {value: 'registrationNo', label: 'Registration No'},
                                            {value: 'duns', label: 'DUNS Number'},
                                            {value: 'lei', label: 'Legal Entity Identifier'},
                                        ],
                                    },
                                },
                                identifierValue: {title: 'Identifier Value'},
                                issuingAuthority: {title: 'Issuing Authority'},
                                issuedDate: {title: 'Issue Date'},
                                expiryDate: {title: 'Expiry Date'},
                            },
                            widget: {
                                columns: [
                                    'identifierType',
                                    'identifierValue',
                                    'issuingAuthority',
                                    'expiryDate',
                                ],
                            },
                        },
                        /**
                         * Units belonging to this organization.
                         *
                         * Hierarchy relationships (unit → organization) are stored in
                         * core.triple with predicate \"belongsTo\". This card will be
                         * populated by a custom adapter handler that traverses core.triple
                         * — placeholder for future implementation or realm contribution.
                         */
                    },
                },

                cards: {
                    browse: {
                        label: 'Organizations',
                        widgets: ['organization'],
                    },
                    details: {
                        label: 'Organization Details',
                        className: 'col-12',
                        widgets: [
                            'organization.legalName',
                            'organization.tradingName',
                            'organization.registrationNumber',
                            'organization.taxId',
                            'organization.establishedDate',
                            'organization.industry',
                            'organization.website',
                            'organization.notes',
                        ],
                    },
                    contactCard: {
                        label: 'Contact Details',
                        widgets: ['contact'],
                    },
                    addressCard: {
                        label: 'Addresses',
                        widgets: ['address'],
                    },
                    identifierCard: {
                        label: 'Identifiers',
                        widgets: ['identifier'],
                    },
                    /**
                     * Units tab — placeholder for core.triple-based hierarchy
                     * queries. Add a card and widget here once a custom adapter
                     * handler for unit→organization membership is implemented.
                     */
                },

                layouts: {
                    edit: [['details']],
                    editThumbIndex: {
                        orientation: 'left',
                        items: [
                            {
                                id: 'details',
                                label: 'Details',
                                icon: 'pi pi-building',
                                widgets: ['details'],
                            },
                            {
                                id: 'contact',
                                label: 'Contact',
                                icon: 'pi pi-envelope',
                                widgets: ['contactCard'],
                            },
                            {
                                id: 'address',
                                label: 'Addresses',
                                icon: 'pi pi-map-marker',
                                widgets: ['addressCard'],
                            },
                            {
                                id: 'identifiers',
                                label: 'Identifiers',
                                icon: 'pi pi-id-card',
                                widgets: ['identifierCard'],
                            },
                            /**
                             * Units tab — placeholder. Add widgets here once a
                             * custom adapter handler queries core.triple for unit →
                             * organization membership.
                             */
                        ],
                    },
                },

                browser: {
                    icon: 'pi pi-building',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/party.organization.new',
                            permission: 'party.organization.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current' as const,
                            method: 'component/party.organization.open',
                            params: '${current}',
                        },
                        {
                            label: 'Report',
                            icon: 'pi pi-chart-bar',
                            action: 'component/party.organization.report',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected' as const,
                            confirm: 'Delete selected organization record?',
                            method: 'party.organization.remove',
                            params: {organizationId: '${organizationId}'},
                        },
                    ],
                },
            };
        },
);
