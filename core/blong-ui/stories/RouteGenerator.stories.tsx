/**
 * RouteGenerator Storybook stories.
 */

import type {Meta, StoryObj} from '@storybook/react-vite';
import {MemoryRouter} from 'react-router-dom';

import type {PageHandler} from '../src/components/RouteGenerator.js';
import {AutoRoutes, deriveRoutePath} from '../src/components/RouteGenerator.js';

const BrowsePage = () => <div>Browse Users</div>;
const NewPage = () => <div>Create User</div>;
const OpenPage = () => <div>Edit User</div>;

const sampleHandlers: PageHandler[] = [
    {
        componentId: 'component$user$user.browse',
        component: BrowsePage,
        meta: {title: 'Users', componentId: 'component$user$user.browse'},
        pageSuffix: 'browse',
    },
    {
        componentId: 'component$user$user.new',
        component: NewPage,
        meta: {title: 'Create User', componentId: 'component$user$user.new'},
        pageSuffix: 'new',
    },
    {
        componentId: 'component$user$user.open',
        component: OpenPage,
        meta: {title: 'Edit User', componentId: 'component$user$user.open'},
        pageSuffix: 'open',
    },
];

function DeriveRoutePathDisplay() {
    const examples = [
        {id: 'component$user$user.browse', suffix: 'browse'},
        {id: 'component$user$user.new', suffix: 'new'},
        {id: 'component$user$user.open', suffix: 'open'},
        {id: 'component$order$order.browse', suffix: 'browse'},
    ];
    return (
        <table style={{borderCollapse: 'collapse', width: '100%'}}>
            <thead>
                <tr>
                    <th
                        style={{
                            textAlign: 'left',
                            padding: '0.5rem',
                            borderBottom: '1px solid #ccc',
                        }}
                    >
                        componentId
                    </th>
                    <th
                        style={{
                            textAlign: 'left',
                            padding: '0.5rem',
                            borderBottom: '1px solid #ccc',
                        }}
                    >
                        pageSuffix
                    </th>
                    <th
                        style={{
                            textAlign: 'left',
                            padding: '0.5rem',
                            borderBottom: '1px solid #ccc',
                        }}
                    >
                        derived path
                    </th>
                </tr>
            </thead>
            <tbody>
                {examples.map(({id, suffix}) => (
                    <tr key={id}>
                        <td style={{padding: '0.5rem', fontFamily: 'monospace'}}>{id}</td>
                        <td style={{padding: '0.5rem', fontFamily: 'monospace'}}>{suffix}</td>
                        <td style={{padding: '0.5rem', fontFamily: 'monospace'}}>
                            {deriveRoutePath(id, suffix)}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

const meta: Meta<typeof AutoRoutes> = {
    title: 'Components/RouteGenerator',
    component: AutoRoutes,
    decorators: [
        Story => (
            <MemoryRouter>
                <Story />
            </MemoryRouter>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof AutoRoutes>;

export const BrowseNewOpen: Story = {
    args: {
        pages: sampleHandlers,
        fallback: <div>Page not found</div>,
    },
};

export const DeriveRoutePathExamples: Story = {
    render: () => <DeriveRoutePathDisplay />,
};
