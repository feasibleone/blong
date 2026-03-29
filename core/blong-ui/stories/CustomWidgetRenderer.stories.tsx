/**
 * CustomWidgetRenderer Storybook stories.
 *
 * Demonstrates rendering a registered custom widget and the error state
 * for an unknown widget name.
 */

import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {FormProvider, useForm} from 'react-hook-form';

import {CustomWidgetRenderer} from '../src/factory/CustomWidgetRenderer.js';
import type {CustomWidgetRendererProps} from '../src/factory/CustomWidgetRenderer.js';
import type {CustomWidgets, WidgetInternals} from '../src/types.js';

// ── Sample custom widget ──────────────────────────────────────────────────────

function ColorPickerWidget({Input, Label, ErrorLabel}: WidgetInternals & {name?: string}) {
    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
            <Label htmlFor="color">Favorite Color</Label>
            <Input name="favoriteColor" type="color" style={{width: '80px', height: '40px'}} />
            <ErrorLabel name="favoriteColor" />
        </div>
    );
}

const customEditors: CustomWidgets = {
    colorPicker: {
        component: ColorPickerWidget,
        properties: ['favoriteColor'],
    },
};

// ── Wrapper ───────────────────────────────────────────────────────────────────

function CustomWidgetRendererWrapper(props: CustomWidgetRendererProps) {
    const form = useForm({defaultValues: {favoriteColor: '#ff0000'}});
    return (
        <FormProvider {...form}>
            <form>
                <CustomWidgetRenderer {...props} />
            </form>
        </FormProvider>
    );
}

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof CustomWidgetRendererWrapper> = {
    title: 'Factory/CustomWidgetRenderer',
    component: CustomWidgetRendererWrapper,
};

export default meta;
type Story = StoryObj<typeof CustomWidgetRendererWrapper>;

// ── Stories ───────────────────────────────────────────────────────────────────

export const Default: Story = {
    name: 'Default (Color Picker)',
    args: {
        widgetName: 'colorPicker',
        editors: customEditors,
        fieldName: 'favoriteColor',
    },
};

export const UnknownWidget: Story = {
    name: 'Unknown Widget (Error State)',
    args: {
        widgetName: 'doesNotExist',
        editors: customEditors,
        fieldName: 'someField',
    },
};
