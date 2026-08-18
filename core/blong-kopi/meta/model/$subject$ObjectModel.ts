import { model } from '@feasibleone/blong';

/**
 * meta/model/$subject$ObjectModel.ts — model spec for the `$object` entity.
 *
 * Drives the auto-generated Browse/New/Open pages.
 *
 * `public: true` — the standard CRUD operations (`find/get/add/edit/remove`)
 * are exposed on the gateway and auto-validated by `subject.validation`
 * (blong-server). When a specific operation differs from the canonical
 * auto-generated one (e.g. `$subject.$object.add` here accepts an optional
 * `details` payload), keep the model public and OVERRIDE only that operation
 * with an explicit `gateway/$subject/$subject$ObjectAdd.ts` validation file —
 * do NOT make the model non-public.
 */
export default model(
    () =>
        async function $subject$ObjectModel() {
            return {
                subject: '$subject',
                object: '$object',
                objectTitle: '$Object',
                public: true,
                nameField: '$object.$objectName',

                schema: {
                    properties: {
                        $object: {
                            properties: {
                                $objectName: {title: 'Name', filter: true, sort: true},
                                $objectStatus: {
                                    title: 'Status',
                                    widget: {
                                        options: [
                                            {value: 'draft', label: 'Draft'},
                                            {value: 'sent', label: 'Sent'},
                                            {value: 'paid', label: 'Paid'},
                                            {value: 'void', label: 'Void'},
                                        ],
                                    },
                                },
                                // server schema defined
                                // $objectId: {},
                                // createdAt: {},
                            },
                            widget: {
                                columns: ['$objectName', '$objectStatus'],
                            },
                        },
                    },
                },

                cards: {
                    browse: {
                        label: '$Objects',
                        widgets: ['$object'],
                    },
                    edit: {
                        label: '$Object Details',
                        className: 'col-12 md:col-8',
                        widgets: ['$object.$objectName', '$object.$objectStatus'],
                    },
                },

                layouts: {
                    edit: [['edit']],
                },

                browser: {
                    title: '$Objects',
                    icon: 'pi pi-file',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/$subject.$object.new',
                            permission: '$subject$ObjectAdd',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/$subject.$object.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm: 'Delete selected $object?',
                            method: '$subject.$object.remove',
                            refresh: true,
                            params: {$objectId: '${$objectId}'},
                        },
                    ],
                },
            };
        },
);
