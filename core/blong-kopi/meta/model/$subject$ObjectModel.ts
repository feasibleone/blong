import { model } from '@feasibleone/blong';

/**
 * meta/model/$subject$ObjectModel.ts — model spec for the `$object` entity.
 *
 * Drives the auto-generated Browse/New/Open pages.
 *
 * `public: true` — the standard CRUD operations (`find/get/add/edit/remove`)
 * are exposed on the gateway and auto-validated by `subject.validation`
 * (blong-server). Master-detail needs NO manual override: declaring
 * `details` + the sibling `line` array schema makes the auto `add`/`edit`
 * accept `{$object: {...}, line: [...]}` and the generic knex adapter persist
 * it. A manual `gateway/<subject>/<method>.ts` validation file is only the
 * escape hatch for non-array extras — keep the model public.
 *
 * MASTER-DETAIL: for the common case where the entity carries detail arrays
 * (e.g. invoice + `line`/`payment`), declare `details` on the model instead of
 * a manual override. The model schema keeps a dedicated key for the master
 * record (`schema.properties.$object`) and one SIBLING array key per detail
 * (`schema.properties.line`, ...) whose `items.properties` hold the detail-row
 * schema. The auto `add`/`edit` validation then accepts
 * `{$object: {...}, line: [...], payment: [...]}` and the New/Open forms render
 * one editable table + tab per detail. See the blong-model skill →
 * "Master-detail (IModelSpec.details)".
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

                // Master-detail: the model schema keeps a dedicated key for the
                // master record (`schema.properties.$object`) and one SIBLING
                // array key per detail (`schema.properties.line`) whose
                // `items.properties` hold the detail-row schema. The framework
                // fills in `type: 'array'` + the editable table widget, a
                // `details-line` card and an edit-layout tab; the auto
                // `add`/`edit` validation accepts `{$object: {...}, line: [...]}`
                // and the generic knex adapter persists the sibling arrays.
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
                        line: {
                            items: {
                                properties: {
                                    lineName: {
                                        title: 'Line Name',
                                        // `input` (single-line InputText), NOT
                                        // `text` — the widget registry maps
                                        // `text` to TextareaWidget (<textarea>).
                                        // The master-detail Playwright helper
                                        // fills `input[id="line-0-lineName"]`.
                                        widget: {type: 'input'},
                                    },
                                    lineQuantity: {
                                        title: 'Quantity',
                                        widget: {type: 'number'},
                                    },
                                },
                            },
                        },
                    },
                },

                details: [{object: 'line'}],

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
