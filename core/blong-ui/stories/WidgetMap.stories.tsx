/**
 * WidgetMap Storybook stories.
 *
 * Demonstrates how JSON Schema type/format pairs resolve to widget types
 * and their corresponding PrimeReact component names.
 */

import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';

import {resolveWidgetType, getPrimeComponent} from '../src/factory/WidgetMap.js';

const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}});

const meta: Meta = {
    title: 'Factory/WidgetMap',
    decorators: [
        (Story) => (
            <QueryClientProvider client={queryClient}>
                <Story />
            </QueryClientProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj;

function WidgetMapDemo(): React.ReactElement {
    const testCases = [
        {type: 'string', format: '', expected: 'input'},
        {type: 'string', format: 'password', expected: 'password'},
        {type: 'string', format: 'date', expected: 'date'},
        {type: 'boolean', format: '', expected: 'boolean'},
        {type: 'integer', format: '', expected: 'integer'},
        {type: 'number', format: '', expected: 'number'},
        {type: 'string', enum: ['a', 'b', 'c'], expected: 'dropdown'},
        {type: 'string', 'x-blong-widget': 'text', expected: 'text'},
    ];
    return (
        <table style={{borderCollapse: 'collapse', width: '100%'}}>
            <thead>
                <tr>
                    <th style={{border: '1px solid #ccc', padding: '8px', textAlign: 'left'}}>Type</th>
                    <th style={{border: '1px solid #ccc', padding: '8px', textAlign: 'left'}}>Format / Override</th>
                    <th style={{border: '1px solid #ccc', padding: '8px', textAlign: 'left'}}>Widget</th>
                    <th style={{border: '1px solid #ccc', padding: '8px', textAlign: 'left'}}>PrimeReact Component</th>
                </tr>
            </thead>
            <tbody>
                {testCases.map((tc, i) => {
                    const resolved = resolveWidgetType(tc as any);
                    const prime = getPrimeComponent(resolved);
                    return (
                        <tr key={i}>
                            <td style={{border: '1px solid #ccc', padding: '8px'}}>{tc.type}</td>
                            <td style={{border: '1px solid #ccc', padding: '8px'}}>{tc.format || (tc as any)['x-blong-widget'] || '—'}</td>
                            <td style={{border: '1px solid #ccc', padding: '8px'}}>{resolved}</td>
                            <td style={{border: '1px solid #ccc', padding: '8px'}}>{prime}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

export const WidgetResolution: Story = {
    render: () => <WidgetMapDemo />,
};
