import {model} from '@feasibleone/blong';

export default model(
    () =>
        async function partyUnitModel() {
            return {
                subject: 'party',
                object: 'unit',
                objectTitle: 'Unit',
                public: true,
                nameField: 'unit.unitName',

                schema: {
                    properties: {
                        unit: {
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
                                // unitId: {},
                            },
                            widget: {
                                columns: ['unitName', 'unitType'],
                            },
                        },
                        /**
                         * Members of this unit.
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
                        label: 'Units',
                        widgets: ['unit'],
                    },
                    details: {
                        label: 'Unit Details',
                        className: 'col-12',
                        widgets: ['unit.unitName', 'unit.unitType', 'unit.notes'],
                    },
                    /**
                     * Members tab — placeholder for core.triple-based hierarchy
                     * queries. Add a card and widget here once a custom adapter
                     * handler for person→unit membership is implemented.
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
                             * unit membership.
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
                            action: 'component/party.unit.new',
                            permission: 'party.unit.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current' as const,
                            method: 'component/party.unit.open',
                            params: '${current}',
                        },
                        {
                            label: 'Report',
                            icon: 'pi pi-chart-bar',
                            action: 'component/party.unit.report',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected' as const,
                            confirm: 'Delete selected unit record?',
                            method: 'party.unit.remove',
                            params: {unitId: '${unitId}'},
                        },
                    ],
                },
            };
        },
);
