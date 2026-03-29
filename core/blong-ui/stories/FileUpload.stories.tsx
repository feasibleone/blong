/**
 * FileUpload Storybook stories.
 */

import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {useForm, FormProvider} from 'react-hook-form';

import {FileUploadField} from '../src/components/FileUpload.js';
import type {FileUploadFieldProps} from '../src/components/FileUpload.js';

function FileUploadWrapper(props: FileUploadFieldProps) {
    const form = useForm();
    return (
        <FormProvider {...form}>
            <form style={{padding: '1rem', maxWidth: '480px'}}>
                <FileUploadField {...props} />
            </form>
        </FormProvider>
    );
}

const meta: Meta<typeof FileUploadField> = {
    title: 'Components/FileUploadField',
    component: FileUploadField,
    decorators: [
        (Story) => (
            <div style={{padding: '1rem'}}>
                <Story />
            </div>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof FileUploadField>;

export const SingleFile: Story = {
    render: (args) => <FileUploadWrapper {...args} />,
    args: {
        name: 'document',
        label: 'Upload Document',
    },
};

export const MultiFile: Story = {
    render: (args) => <FileUploadWrapper {...args} />,
    args: {
        name: 'images',
        label: 'Upload Images',
        multiple: true,
        accept: 'image/*',
    },
};

export const RequiredFile: Story = {
    render: (args) => <FileUploadWrapper {...args} />,
    args: {
        name: 'avatar',
        label: 'Profile Photo',
        accept: 'image/*',
        required: true,
        maxSize: 5 * 1024 * 1024,
    },
};
