/**
 * Pivot stories — table pivot views with static and dynamic row sets.
 *
 * Static pivot: pre-defined `examples` rows joined to actual data.
 * Dynamic pivot: rows sourced from a named dropdown, joined to actual data.
 */
import type {Meta} from '@storybook/react-vite';
import type {StoryFn} from '../Editor.stories.js';
import {Editor} from '../Editor.js';

const meta: Meta<typeof Editor> = {title: 'Editor/Pivot', component: Editor};
export default meta;

export const Pivot: StoryFn = () => (
    <Editor
        schema={{
            properties: {
                schedule: {
                    title: '' as const,
                    type: 'array' as const,
                    items: {
                        type: 'object' as const,
                        properties: {
                            weekdayName: {title: 'Weekday Name', readOnly: true},
                            startTime: {title: 'Start Time'},
                            endTime: {title: 'End Time'},
                        },
                    },
                    widget: {
                        type: 'table' as const,
                        pivot: {
                            join: {weekdayName: 'weekdayName'},
                            examples: [
                                {weekdayName: 'Monday'},
                                {weekdayName: 'Tuesday'},
                                {weekdayName: 'Wednesday'},
                                {weekdayName: 'Thursday'},
                                {weekdayName: 'Friday'},
                                {weekdayName: 'Saturday'},
                                {weekdayName: 'Sunday'},
                            ],
                        },
                        actions: {allowAdd: false, allowDelete: false},
                    },
                } as never,
                permission: {
                    title: '' as const,
                    type: 'array' as const,
                    items: {
                        type: 'object' as const,
                        properties: {
                            entityId: {title: 'Entity ID'},
                            entityName: {title: 'Entity Name', readOnly: true},
                            view: {title: 'View', type: 'boolean' as const},
                            create: {title: 'Create', type: 'boolean' as const},
                            edit: {title: 'Edit', type: 'boolean' as const},
                            delete: {title: 'Delete', type: 'boolean' as const},
                        },
                    },
                    widget: {
                        type: 'table' as const,
                        pivot: {
                            dropdown: 'entity',
                            join: {value: 'entityId', label: 'entityName'},
                        },
                        actions: {allowAdd: false, allowDelete: false},
                    },
                } as never,
            },
        }}
        cards={{
            schedule: {
                label: 'Schedule (static pivot)',
                widgets: [
                    {
                        id: 'schedule',
                        name: 'schedule',
                        widgets: ['weekdayName', 'startTime', 'endTime'],
                    },
                ],
            },
            permission: {
                label: 'Permission (dynamic pivot)',
                widgets: [
                    {
                        id: 'permission',
                        name: 'permission',
                        widgets: ['entityName', 'view', 'create', 'edit', 'delete'],
                    },
                ],
            },
        }}
        dropdowns={{
            entity: [
                {value: 1, label: 'Organization'},
                {value: 2, label: 'Role'},
                {value: 3, label: 'User'},
                {value: 4, label: 'Product'},
                {value: 5, label: 'Account'},
            ],
        }}
        value={{
            schedule: [
                {weekdayName: 'Tuesday', startTime: '16:00', endTime: '17:00'},
                {weekdayName: 'Friday', startTime: '09:00', endTime: '10:00'},
            ],
            permission: [
                {entityId: 1, entityName: 'Organization', create: true, edit: true},
                {entityId: 2, entityName: 'Role', view: true},
                {
                    entityId: 3,
                    entityName: 'User',
                    view: true,
                    create: true,
                    edit: true,
                    delete: true,
                },
            ],
        }}
        editable
        editMode
        layout="edit"
        layouts={{edit: [['schedule', 'permission']]}}
    />
);

export const PivotBG: StoryFn = () => (
    <Editor
        schema={{
            properties: {
                schedule: {
                    title: '' as const,
                    type: 'array' as const,
                    items: {
                        type: 'object' as const,
                        properties: {
                            weekdayName: {title: 'Weekday Name', readOnly: true},
                            startTime: {title: 'Start Time'},
                            endTime: {title: 'End Time'},
                        },
                    },
                    widget: {
                        type: 'table' as const,
                        pivot: {
                            join: {weekdayName: 'weekdayName'},
                            examples: [
                                {weekdayName: 'Monday'},
                                {weekdayName: 'Tuesday'},
                                {weekdayName: 'Wednesday'},
                                {weekdayName: 'Thursday'},
                                {weekdayName: 'Friday'},
                                {weekdayName: 'Saturday'},
                                {weekdayName: 'Sunday'},
                            ],
                        },
                        actions: {allowAdd: false, allowDelete: false},
                    },
                } as never,
                permission: {
                    title: '' as const,
                    type: 'array' as const,
                    items: {
                        type: 'object' as const,
                        properties: {
                            entityId: {title: 'Entity ID'},
                            entityName: {title: 'Entity Name', readOnly: true},
                            view: {title: 'View', type: 'boolean' as const},
                            create: {title: 'Create', type: 'boolean' as const},
                            edit: {title: 'Edit', type: 'boolean' as const},
                            delete: {title: 'Delete', type: 'boolean' as const},
                        },
                    },
                    widget: {
                        type: 'table' as const,
                        pivot: {
                            dropdown: 'entity',
                            join: {value: 'entityId', label: 'entityName'},
                        },
                        actions: {allowAdd: false, allowDelete: false},
                    },
                } as never,
            },
        }}
        cards={{
            schedule: {
                label: 'График (статичен pivot)',
                widgets: [
                    {
                        id: 'schedule',
                        name: 'schedule',
                        widgets: ['weekdayName', 'startTime', 'endTime'],
                    },
                ],
            },
            permission: {
                label: 'Права (динамичен pivot)',
                widgets: [
                    {
                        id: 'permission',
                        name: 'permission',
                        widgets: ['entityName', 'view', 'create', 'edit', 'delete'],
                    },
                ],
            },
        }}
        dropdowns={{
            entity: [
                {value: 1, label: 'Организация'},
                {value: 2, label: 'Роля'},
                {value: 3, label: 'Потребител'},
                {value: 4, label: 'Продукт'},
                {value: 5, label: 'Сметка'},
            ],
        }}
        value={{
            schedule: [
                {weekdayName: 'Tuesday', startTime: '16:00', endTime: '17:00'},
                {weekdayName: 'Friday', startTime: '09:00', endTime: '10:00'},
            ],
            permission: [
                {entityId: 1, entityName: 'Организация', create: true, edit: true},
                {entityId: 2, entityName: 'Роля', view: true},
                {
                    entityId: 3,
                    entityName: 'Потребител',
                    view: true,
                    create: true,
                    edit: true,
                    delete: true,
                },
            ],
        }}
        editable
        editMode
        layout="edit"
        layouts={{edit: [['schedule', 'permission']]}}
    />
);
