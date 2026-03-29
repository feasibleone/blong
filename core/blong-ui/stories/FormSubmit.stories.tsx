/**
 * FormSubmit Storybook stories.
 *
 * Demonstrates prepareSubmit, mergeResponse, createSubmitHandler,
 * and snapshotOriginal utilities.
 */

import React from 'react';
import type {Meta} from '@storybook/react-vite';

import {prepareSubmit, mergeResponse} from '../src/factory/FormSubmit.js';

const meta: Meta = {
    title: 'Factory/FormSubmit',
};

export default meta;

function FormSubmitDemo() {
    const rawData = {
        userName: 'alice',
        emailAddress: 'alice@example.com',
        $original: {userName: 'alice_old'},
        $modified: {userName: true},
        $selected: {},
    };
    const cleaned = prepareSubmit(rawData);
    return (
        <div style={{fontFamily: 'monospace', padding: '16px'}}>
            <h4>Raw form data (with $ internal fields):</h4>
            <pre>{JSON.stringify(rawData, null, 2)}</pre>
            <h4>After prepareSubmit ($ fields removed):</h4>
            <pre>{JSON.stringify(cleaned, null, 2)}</pre>
        </div>
    );
}

function MergeResponseDemo() {
    const formData = {
        userName: 'alice',
        emailAddress: 'alice@example.com',
    };
    const serverResponse = {
        userId: 42,
        emailAddress: 'alice@verified.example.com',
        createdAt: '2024-01-15T10:00:00Z',
    };
    const merged = mergeResponse(formData, serverResponse);
    return (
        <div style={{fontFamily: 'monospace', padding: '16px'}}>
            <h4>Form data (before save):</h4>
            <pre>{JSON.stringify(formData, null, 2)}</pre>
            <h4>Server response:</h4>
            <pre>{JSON.stringify(serverResponse, null, 2)}</pre>
            <h4>After mergeResponse (server fields win):</h4>
            <pre>{JSON.stringify(merged, null, 2)}</pre>
        </div>
    );
}

export const PrepareSubmitDemo = {
    render: () => <FormSubmitDemo />,
};

export const MergeResponseDemoStory = {
    name: 'MergeResponseDemo',
    render: () => <MergeResponseDemo />,
};
