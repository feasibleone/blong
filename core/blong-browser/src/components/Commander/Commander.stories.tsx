import type {Meta, StoryObj} from '@storybook/react-vite';
import {Commander, type ICommanderSource, type ICommanderLevel} from './Commander.js';

// ── Fixtures: a mock SQL source with schema → table → row hierarchy ─────────
const sqlSource: ICommanderSource = {
    name: 'sql-dev',
    label: 'SQL (dev)',
    icon: 'pi pi-database',
    levels: [
        {
            resourceType: 'schema',
            label: 'Schema',
            keyField: 'schemaName',
            labelField: 'schemaName',
            list: {method: 'sql-dev.schema.list', resultSet: 'items'},
        },
        {
            resourceType: 'table',
            label: 'Table',
            keyField: 'tableName',
            labelField: 'tableName',
            viewer: 'table',
            list: {
                method: 'sql-dev.table.list',
                resultSet: 'items',
                params: (parent: Record<string, unknown> | null) => ({schema: parent?.schemaName}),
            },
        },
        {
            resourceType: 'row',
            label: 'Row',
            keyField: 'rowId',
            labelField: 'rowId',
            viewer: 'json',
            open: {method: 'sql-dev.row.get'},
            list: {
                method: 'sql-dev.row.find',
                params: (parent: Record<string, unknown> | null) => ({table: parent?.tableName}),
            },
        },
    ],
};

const schemas = [{schemaName: 'core'}, {schemaName: 'access'}, {schemaName: 'marine'}];
const tables: Record<string, Array<{tableName: string}>> = {
    core: [{tableName: 'resource'}, {tableName: 'type'}, {tableName: 'triple'}],
    access: [{tableName: 'role'}, {tableName: 'capability'}, {tableName: 'action'}],
    marine: [{tableName: 'coral'}, {tableName: 'fish'}],
};
const rows: Record<string, Array<{rowId: number; name: string}>> = {
    resource: [
        {rowId: 1, name: 'resource-1'},
        {rowId: 2, name: 'resource-2'},
    ],
    role: [{rowId: 1, name: 'admin'}, {rowId: 2, name: 'guest'}],
    coral: [{rowId: 1, name: 'Acropora'}, {rowId: 2, name: 'Coral-2'}],
};

const listChildren = async (level: ICommanderLevel, parent: Record<string, unknown> | null) => {
    switch (level.resourceType) {
        case 'schema':
            return schemas;
        case 'table':
            return parent ? (tables[parent.schemaName as string] ?? []) : [];
        case 'row':
            return parent ? (rows[parent.tableName as string] ?? []) : [];
        default:
            return [];
    }
};

const getNode = async (_level: ICommanderLevel, node: Record<string, unknown>) => ({
    ...node,
    content: 'Fetched viewer content for ' + String(node.name ?? node.rowId ?? 'node'),
});

const meta: Meta<typeof Commander> = {
    title: 'Data/Commander',
    component: Commander,
    tags: ['autodocs'],
    parameters: {layout: 'fullscreen'},
};
export default meta;

type Story = StoryObj<typeof Commander>;

/** Default — SQL source with schema → table → row tree and leaf JSON viewer. */
export const Default: Story = {
    args: {
        sources: [sqlSource],
        listChildren,
        getNode,
    },
};

/** Two sources — demonstrates the multi-backend tree root. */
export const MultiSource: Story = {
    args: {
        sources: [
            sqlSource,
            {
                ...sqlSource,
                name: 'sql-analytics',
                label: 'SQL (analytics)',
            },
        ],
        listChildren,
        getNode,
    },
};
