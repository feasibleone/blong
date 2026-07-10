import {model} from '@feasibleone/blong';

export default model(
    () =>
        async function partyOrgUnitModel() {
            return {
                subject: 'party',
                object: 'orgUnit',
                objectTitle: 'Org Unit',
                nameField: 'orgUnit.unitName',

                schema: {
                    properties: {
                        orgUnit: {
                            properties: {
                                unitName: {title: 'Unit Name'},
                                unitType: {
                                    title: 'Unit Type',
                                    widget: {
                                        options: [
                                            {value: 'division', label: 'Division'},
                                            {value: 'department', label: 'Department'},
                                            {value: 'branch', label: 'Branch'},
                                            {value: 'team', label: 'Team'},
                                        ],
                                    },
                                },
                                notes: {title: 'Notes'},
                                // server schema defined
                                // orgUnitId: {},
                            },
                            widget: {
                                columns: ['unitName', 'unitType'],
                            },
                        },
                        /**
                         * Members of this org unit.
                         *
                         * Hierarchy relationships (person → orgUnit) are stored in core.triple
                         * with predicate \"belongsTo\". This card will be populated by a custom
                         * adapter handler that traverses core.triple — placeholder for future
                         * implementation or realm contribution.
                         */
                    },
                },

                cards: {
                    browse: {
                        label: 'Org Units',
                        widgets: ['orgUnit'],
                    },
                    details: {
                        label: 'Unit Details',
                        className: 'col-12',
                        widgets: ['orgUnit.unitName', 'orgUnit.unitType', 'orgUnit.notes'],
                    },
                    /**
                     * Members tab — placeholder for core.triple-based hierarchy
                     * queries. Add a card and widget here once a custom adapter
                     * handler for person→orgUnit membership is implemented.
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
                                icon: 'pi pi-info-circle',
                                widgets: ['details'],
                            },
                            /**
                             * Members tab — placeholder. Add widgets here once a
                             * custom adapter handler queries core.triple for person →
                             * orgUnit membership.
                             */
                        ],
                    },
                },

                browser: {
                    icon: 'pi pi-sitemap',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/party.orgUnit.new',
                            permission: 'party.orgUnit.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current' as const,
                            method: 'component/party.orgUnit.open',
                            params: '${current}',
                        },
                        {
                            label: 'Report',
                            icon: 'pi pi-chart-bar',
                            action: 'component/party.orgUnit.report',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected' as const,
                            confirm: 'Delete selected org unit record?',
                            method: 'party.orgUnit.remove',
                            params: {orgUnitId: '${orgUnitId}'},
                        },
                    ],
                },
            };
        },
);
