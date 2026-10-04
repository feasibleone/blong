import {model} from '@feasibleone/blong';

/**
 * partyConsentModel — consent records (Browse/New/Open).
 *
 * A consent belongs to a person (`consent --belongsTo--> person`, managed as a
 * pivot by the generic CRUD) and is one of the records the record-level ACL
 * matrix probes: `meta/db/db.ts` declares the table `acl: {mode: 'explicit'}`, so
 * the model page and the matrix describe the same access — a rule or nothing.
 */
export default model(
    () =>
        async function partyConsentModel() {
            return {
                subject: 'party',
                object: 'consent',
                objectTitle: 'Consent',
                public: true,
                nameField: 'consent.consentName',

                schema: {
                    properties: {
                        consent: {
                            properties: {
                                consentName: {title: 'Name'},
                                consentType: {
                                    title: 'Type',
                                    widget: {
                                        options: [
                                            {value: 'marketing', label: 'Marketing'},
                                            {value: 'research', label: 'Research'},
                                            {value: 'profiling', label: 'Profiling'},
                                        ],
                                    },
                                },
                                isGranted: {title: 'Granted', type: 'boolean'},
                                notes: {title: 'Notes'},
                                // server schema defined
                                // consentId: {},
                            },
                            widget: {
                                columns: ['consentName', 'consentType', 'isGranted'],
                            },
                        },
                        person: {
                            // The owning person.  The `belongsTo` edge is declared
                            // in `meta/db/db.ts`, so the pivot is maintained by the
                            // generic CRUD.
                            title: '',
                            items: {
                                properties: {
                                    firstName: {title: 'First Name'},
                                    lastName: {title: 'Last Name'},
                                },
                            },
                            widget: {
                                type: 'table',
                                columns: ['firstName', 'lastName'],
                            },
                        },
                    },
                },

                cards: {
                    browse: {
                        label: 'Consents',
                        widgets: ['consent'],
                    },
                    details: {
                        label: 'Consent Details',
                        className: 'col-12',
                        widgets: [
                            'consent.consentName',
                            'consent.consentType',
                            'consent.isGranted',
                            'consent.notes',
                        ],
                    },
                    personCard: {
                        label: 'Person',
                        widgets: ['person'],
                    },
                },

                layouts: {
                    edit: [['details']],
                    editThumbIndex: {
                        orientation: 'left',
                        items: [
                            {
                                id: 'details',
                                label: 'Consent Details',
                                icon: 'pi pi-check-square',
                                widgets: ['details'],
                            },
                            {
                                id: 'person',
                                label: 'Person',
                                icon: 'pi pi-user',
                                widgets: ['personCard'],
                            },
                        ],
                    },
                },

                browser: {
                    icon: 'pi pi-check-square',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/party.consent.new',
                            permission: 'party.consent.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current' as const,
                            method: 'component/party.consent.open',
                            params: '${current}',
                        },
                        {
                            label: 'Report',
                            icon: 'pi pi-chart-bar',
                            action: 'component/party.consent.report',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected' as const,
                            confirm: 'Delete selected consent record?',
                            method: 'party.consent.remove',
                            params: {consentId: '${consentId}'},
                        },
                    ],
                },
            };
        },
);
