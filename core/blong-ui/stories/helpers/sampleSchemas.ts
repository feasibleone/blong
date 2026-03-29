/**
 * Sample schemas for Storybook stories.
 */
import type {BlongSchema, Cards, Layout, Layouts, DropdownOption, PortalConfig} from '../../src/types.js';

export const userSchema: BlongSchema = {
    type: 'object',
    required: ['userName', 'emailAddress'],
    properties: {
        userId: {type: 'integer', title: 'ID', 'x-blong-hidden': true},
        userName: {type: 'string', title: 'Username', maxLength: 50, 'x-blong-order': 1},
        emailAddress: {type: 'string', title: 'Email', format: 'email', 'x-blong-order': 2},
        firstName: {type: 'string', title: 'First Name', 'x-blong-order': 3, 'x-blong-group': 'personal'},
        lastName: {type: 'string', title: 'Last Name', 'x-blong-order': 4, 'x-blong-group': 'personal'},
        isActive: {type: 'boolean', title: 'Active', 'x-blong-order': 5},
        roleId: {
            type: 'integer',
            title: 'Role',
            'x-blong-widget': 'dropdown',
            'x-blong-lookup': 'role',
            'x-blong-order': 6,
        },
        notes: {
            type: 'string',
            title: 'Notes',
            maxLength: 1000,
            'x-blong-widget': 'text',
            'x-blong-order': 7,
            'x-blong-group': 'additional',
        },
    },
} as BlongSchema;

export const userListSchema: BlongSchema = {
    type: 'array',
    items: {
        type: 'object',
        properties: {
            userId: {type: 'integer', title: 'ID', 'x-blong-order': 1, 'x-blong-column': {width: '80px'}},
            userName: {type: 'string', title: 'Username', 'x-blong-order': 2},
            emailAddress: {type: 'string', title: 'Email', 'x-blong-order': 3},
            isActive: {type: 'boolean', title: 'Active', 'x-blong-order': 4},
            createdAt: {type: 'string', title: 'Created', format: 'date', 'x-blong-order': 5},
        },
    },
} as BlongSchema;

export const userCards: Cards = {
    account: {id: 'account', label: 'Account', widgets: ['userName', 'emailAddress', 'isActive', 'roleId']},
    personal: {id: 'personal', label: 'Personal', widgets: ['firstName', 'lastName']},
    additional: {id: 'additional', label: 'Additional', widgets: ['notes']},
};

export const userLayout: Layout = {cards: ['account', 'personal', 'additional']};

export const userLayouts: Layouts = {
    edit: userLayout,
    create: {cards: ['account', 'personal']},
};

export const roleOptions: DropdownOption[] = [
    {value: 1, label: 'Admin'},
    {value: 2, label: 'Editor'},
    {value: 3, label: 'Viewer'},
];

export const sampleUsers = [
    {
        userId: 1,
        userName: 'alice',
        emailAddress: 'alice@example.com',
        firstName: 'Alice',
        lastName: 'Smith',
        isActive: true,
        roleId: 1,
        createdAt: '2024-01-15',
    },
    {
        userId: 2,
        userName: 'bob',
        emailAddress: 'bob@example.com',
        firstName: 'Bob',
        lastName: 'Jones',
        isActive: true,
        roleId: 2,
        createdAt: '2024-02-20',
    },
    {
        userId: 3,
        userName: 'charlie',
        emailAddress: 'charlie@example.com',
        firstName: 'Charlie',
        lastName: 'Brown',
        isActive: false,
        roleId: 3,
        createdAt: '2024-03-10',
    },
];

export const samplePortalConfig: PortalConfig = {
    portalName: 'Demo Portal',
    theme: 'lara-light',
    menu: [
        {label: 'Dashboard', to: '/', icon: '🏠'},
        {
            label: 'Users',
            to: '/users',
            icon: '👥',
            items: [
                {label: 'User List', to: '/users'},
                {label: 'Create User', to: '/users/new'},
            ],
        },
        {label: 'Reports', to: '/reports', icon: '📊'},
        {label: 'Settings', to: '/settings', icon: '⚙️'},
    ],
};
