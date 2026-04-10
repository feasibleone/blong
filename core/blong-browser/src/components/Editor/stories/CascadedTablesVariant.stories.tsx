/**
 * Uses a tab layout: "Permission settings" tab shows three cascaded tables side-by-side
 * (roleCategory → permission → permissionRole). A second "Documents" tab shows a document list.
 *
 * - roleCategory: read-only list of permission categories
 * - permission: filtered by selected roleCategory, hasRight inline toggle
 * - permissionRole: filtered by selected permission action, selected inline toggle
 * - The permissionRole card is only shown when roleCategory.hasSettings === true
 */
import type {Meta} from '@storybook/react-vite';
import type {StoryFn} from '../Editor.stories.js';
import {Editor} from '../index.js';

const meta: Meta<typeof Editor> = {title: 'Editor/CascadedTablesVariant', component: Editor};
export default meta;

const variantValue = {
    roleCategory: [
        {actionCategoryId: 478, label: 'Manage Users', hasSettings: true},
        {actionCategoryId: 681, label: 'Manage History', hasSettings: false},
        {actionCategoryId: 259, label: 'Manage Content Items and Translations', hasSettings: false},
    ],
    permission: [
        {actionCategoryId: 259, actionId: 1006, actionName: 'Add Item', hasRight: true},
        {actionCategoryId: 259, actionId: 1025, actionName: 'Edit Item', hasRight: false},
        {
            actionCategoryId: 259,
            actionId: 1029,
            actionName: 'Enable / Disable Item',
            hasRight: false,
        },
        {actionCategoryId: 478, actionId: 1008, actionName: 'Add User', hasRight: true},
        {actionCategoryId: 478, actionId: 1011, actionName: 'Authorize Changes', hasRight: false},
        {
            actionCategoryId: 478,
            actionId: 1014,
            actionName: 'Clear Unsuccessful Login Attempts',
            hasRight: false,
        },
        {actionCategoryId: 478, actionId: 1020, actionName: 'Delete User', hasRight: false},
        {actionCategoryId: 478, actionId: 1028, actionName: 'Edit User', hasRight: false},
        {
            actionCategoryId: 681,
            actionId: 1109,
            actionName: 'Access Policy History Log',
            hasRight: true,
        },
        {
            actionCategoryId: 681,
            actionId: 1074,
            actionName: 'Agents and Merchants Network History Log',
            hasRight: false,
        },
        {actionCategoryId: 681, actionId: 1150, actionName: 'Export History', hasRight: false},
    ],
    permissionRole: [
        {actionId: 1008, value: 1167, selected: true, label: 'Banks Branch User'},
        {actionId: 1008, value: 1168, selected: true, label: 'CBI Admin'},
        {actionId: 1008, value: 1169, selected: true, label: 'CBI Auditor'},
        {actionId: 1008, value: 1170, selected: false, label: 'CBI Compliance Office User'},
        {actionId: 1109, value: 1171, selected: true, label: 'CBI Directorate Admin Checker'},
        {actionId: 1109, value: 1172, selected: false, label: 'CBI Directorate Admin Maker'},
    ],
    document: [
        {
            documentId: 1,
            documentType: 'Passport',
            issueDate: '2020-01-01',
            expiryDate: '2025-01-01',
            check: true,
        },
        {
            documentId: 2,
            documentType: 'Driving License',
            issueDate: '2020-01-02',
            expiryDate: '2025-01-02',
            check: false,
        },
        {
            documentId: 3,
            documentType: 'Marriage Certificate',
            issueDate: '2020-01-03',
            expiryDate: '2025-01-03',
            check: true,
        },
    ],
};

export const CascadedTablesVariant: StoryFn = () => (
    <Editor
        schema={{
            properties: {
                roleCategory: {
                    title: '',
                    type: 'array',
                    widget: {
                        type: 'table',
                        selectionMode: 'single',
                        actions: {allowAdd: false, allowDelete: false, allowEdit: false},
                        columns: ['label'],
                    },
                    items: {
                        properties: {
                            actionCategoryId: {title: 'ID', readOnly: true},
                            label: {title: 'Category', readOnly: true},
                            hasSettings: {title: 'Has Settings', type: 'boolean'},
                        },
                    },
                },
                permission: {
                    title: '',
                    type: 'array',
                    widget: {
                        type: 'table',
                        selectionMode: 'single',
                        actions: {allowAdd: false, allowDelete: false, allowEdit: false},
                        columns: ['hasRight', 'actionName'],
                        parent: '$.selected.roleCategory',
                        master: {actionCategoryId: 'actionCategoryId'},
                        autoSelect: true,
                    },
                    items: {
                        properties: {
                            actionCategoryId: {title: 'Category ID', readOnly: true},
                            actionId: {title: 'Action ID', readOnly: true},
                            actionName: {title: 'Granted Permissions', readOnly: true},
                            hasRight: {title: ' ', type: 'boolean'},
                        },
                    },
                },
                permissionRole: {
                    title: '',
                    type: 'array',
                    widget: {
                        type: 'table',
                        selectionMode: 'single',
                        actions: {allowAdd: false, allowDelete: false, allowEdit: false},
                        columns: ['selected', 'label'],
                        parent: '$.selected.permission',
                        master: {actionId: 'actionId'},
                        autoSelect: true,
                    },
                    items: {
                        properties: {
                            actionId: {title: 'Action ID', readOnly: true},
                            value: {title: 'Value', readOnly: true},
                            selected: {title: ' ', type: 'boolean'},
                            label: {title: 'Permissions for Role'},
                        },
                    },
                },
                document: {
                    title: '',
                    type: 'array',
                    widget: {
                        type: 'table',
                        actions: {allowEdit: false},
                        columns: ['documentType', 'issueDate', 'expiryDate', 'check'],
                    },
                    items: {
                        properties: {
                            documentId: {title: 'ID', readOnly: true},
                            documentType: {title: 'Document Type'},
                            issueDate: {title: 'Issue Date'},
                            expiryDate: {title: 'Expiry Date'},
                            check: {title: 'Check', type: 'boolean'},
                        },
                    },
                },
            },
        }}
        cards={{
            roleCategory: {
                label: undefined,
                className: 'col-12 md:col-4',
                widgets: ['roleCategory'],
            },
            permission: {
                label: undefined,
                className: 'col-12 md:col-4',
                widgets: ['permission'],
            },
            permissionRole: {
                label: undefined,
                className: 'col-12 md:col-4',
                widgets: ['permissionRole'],
            },
            document: {
                label: 'Document',
                className: 'col-12',
                widgets: ['document'],
            },
        }}
        value={variantValue}
        editable
        editMode
        layout="edit"
        layouts={{
            edit: {
                orientation: 'left',
                items: [
                    {
                        id: 'permissions',
                        label: 'Permission settings',
                        widgets: ['roleCategory', 'permission', 'permissionRole'],
                    },
                    {id: 'documents', label: 'Documents', widgets: ['document']},
                ],
            },
        }}
    />
);
