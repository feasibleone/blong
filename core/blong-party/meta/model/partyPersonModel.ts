import {model} from '@feasibleone/blong';

export default model(
    () =>
        async function partyPersonModel() {
            return {
                subject: 'party',
                object: 'person',
                objectTitle: 'Person',
                nameField: 'person.lastName',

                schema: {
                    properties: {
                        person: {
                            properties: {
                                firstName: {title: 'First Name'},
                                middleName: {title: 'Middle Name'},
                                lastName: {title: 'Last Name'},
                                birthDate: {title: 'Date of Birth'},
                                gender: {
                                    title: 'Gender',
                                    widget: {
                                        options: [
                                            {value: 'male', label: 'Male'},
                                            {value: 'female', label: 'Female'},
                                            {value: 'other', label: 'Other'},
                                        ],
                                    },
                                },
                                maritalStatus: {
                                    title: 'Marital Status',
                                    widget: {
                                        options: [
                                            {value: 'single', label: 'Single'},
                                            {value: 'married', label: 'Married'},
                                            {value: 'divorced', label: 'Divorced'},
                                            {value: 'widowed', label: 'Widowed'},
                                        ],
                                    },
                                },
                                nationality: {title: 'Nationality', filter: true},
                                occupation: {title: 'Occupation'},
                                notes: {title: 'Notes'},
                                // server schema defined
                                // personId: {},
                            },
                            widget: {
                                columns: ['firstName', 'lastName', 'nationality', 'occupation'],
                            },
                        },
                        /** Contact details card — email, phone, mobile. */
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
                        /** Address card — physical addresses. */
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
                                // server schema defined
                                // partyAddressId: {},
                                // partyResourceId: {},
                                // countryId: {},
                            },
                            widget: {
                                columns: ['addressType', 'streetAddress', 'city', 'isPrimary'],
                            },
                        },
                        /** Identifier card — official IDs. */
                        identifier: {
                            properties: {
                                identifierType: {
                                    title: 'Identifier Type',
                                    widget: {
                                        options: [
                                            {value: 'passport', label: 'Passport'},
                                            {value: 'nationalId', label: 'National ID'},
                                            {value: 'driversLicense', label: "Driver's License"},
                                            {value: 'ssn', label: 'Social Security No'},
                                            {value: 'taxId', label: 'Tax ID'},
                                        ],
                                    },
                                },
                                identifierValue: {title: 'Identifier Value'},
                                issuingAuthority: {title: 'Issuing Authority'},
                                issuedDate: {title: 'Issue Date'},
                                expiryDate: {title: 'Expiry Date'},
                                // server schema defined
                                // partyIdentifierId: {},
                                // partyResourceId: {},
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
                         * Organization membership card — linked units.
                         *
                         * Hierarchy relationships (person → unit) are stored in core.triple
                         * with predicate \"belongsTo\". This card will be populated by a custom
                         * adapter handler that traverses core.triple — placeholder for future
                         * implementation or realm contribution.
                         */
                    },
                },

                cards: {
                    browse: {
                        label: 'Persons',
                        widgets: ['person'],
                    },
                    personal: {
                        label: 'Personal Info',
                        className: 'col-12',
                        widgets: [
                            'person.firstName',
                            'person.middleName',
                            'person.lastName',
                            'person.birthDate',
                            'person.gender',
                            'person.maritalStatus',
                            'person.nationality',
                            'person.occupation',
                            'person.notes',
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
                     * Organization membership tab — placeholder for core.triple-based
                     * hierarchy queries. Add a card and widget here once a custom
                     * adapter handler for person→unit membership is implemented.
                     */
                },

                layouts: {
                    edit: [['personal']],
                    editThumbIndex: {
                        orientation: 'left',
                        items: [
                            {
                                id: 'personal',
                                label: 'Personal Info',
                                icon: 'pi pi-user',
                                widgets: ['personal'],
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
                             * Organization tab — placeholder. Add widgets here once a
                             * custom adapter handler queries core.triple for person →
                             * unit → organization membership.
                             */
                        ],
                    },
                },

                browser: {
                    icon: 'pi pi-users',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/party.person.new',
                            permission: 'party.person.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current' as const,
                            method: 'component/party.person.open',
                            params: '${current}',
                        },
                        {
                            label: 'Report',
                            icon: 'pi pi-chart-bar',
                            action: 'component/party.person.report',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected' as const,
                            confirm: 'Delete selected person record?',
                            method: 'party.person.remove',
                            params: {personId: '${personId}'},
                        },
                    ],
                },
            };
        },
);
