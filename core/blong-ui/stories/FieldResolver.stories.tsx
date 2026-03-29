/**
 * FieldResolver Storybook stories.
 *
 * Demonstrates resolveField, resolveFields, and renderField utilities
 * with various x-blong-* extension combinations.
 */

import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {FormProvider, useForm} from 'react-hook-form';

import {resolveField, renderField} from '../src/factory/FieldResolver.js';
import type {BlongSchemaProperty} from '../src/types.js';

function FieldResolverDemo({properties}: {properties: Record<string, BlongSchemaProperty>}) {
    const form = useForm();
    const fields = Object.entries(properties).map(([name, prop]) => resolveField(name, prop, []));
    return (
        <FormProvider {...form}>
            <form style={{display: 'grid', gap: '8px', maxWidth: '400px'}}>
                {fields.map(field => renderField(field, form))}
            </form>
        </FormProvider>
    );
}

const meta: Meta<typeof FieldResolverDemo> = {
    title: 'Factory/FieldResolver',
    component: FieldResolverDemo,
};

export default meta;
type Story = StoryObj<typeof FieldResolverDemo>;

export const ScalarFields: Story = {
    args: {
        properties: {
            userName: {type: 'string', title: 'Username', 'x-blong-order': 1},
            age: {type: 'integer', title: 'Age', minimum: 0, maximum: 150, 'x-blong-order': 2},
            isActive: {type: 'boolean', title: 'Active', 'x-blong-order': 3},
            birthDate: {type: 'string', format: 'date', title: 'Birth Date', 'x-blong-order': 4},
        },
    },
};

export const DropdownFields: Story = {
    args: {
        properties: {
            countryId: {
                type: 'integer',
                title: 'Country',
                'x-blong-widget': 'dropdown',
                'x-blong-lookup': 'country',
                'x-blong-order': 1,
            },
            statusCode: {
                type: 'string',
                title: 'Status',
                'x-blong-widget': 'select',
                'x-blong-order': 2,
            },
        },
    },
};

export const SpecialFields: Story = {
    args: {
        properties: {
            passwordText: {
                type: 'string',
                title: 'Password',
                'x-blong-widget': 'password',
                'x-blong-order': 1,
            },
            bioText: {
                type: 'string',
                title: 'Bio',
                maxLength: 500,
                'x-blong-widget': 'text',
                'x-blong-order': 2,
            },
            phoneNumber: {
                type: 'string',
                title: 'Phone',
                'x-blong-widget': 'mask',
                'x-blong-mask': '(999) 999-9999',
                'x-blong-order': 3,
            },
        },
    },
};
