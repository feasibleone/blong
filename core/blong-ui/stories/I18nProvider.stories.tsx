import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {I18nProvider, useI18n} from '../src/components/I18nProvider.js';

const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}})

const meta: Meta<typeof I18nProvider> = {
    title: 'Components/I18nProvider',
    component: I18nProvider,
    decorators: [
        (Story) => (
            <QueryClientProvider client={queryClient}>
                <Story />
            </QueryClientProvider>
        ),
    ],
}
export default meta
type Story = StoryObj<typeof I18nProvider>

function TranslationDemo() {
    const {t, locale, direction} = useI18n()
    return (
        <div dir={direction} style={{padding: '16px'}}>
            <p>Locale: {locale}</p>
            <p>Direction: {direction}</p>
            <p>Greeting: {t('greeting', {name: 'Alice'})}</p>
            <p>Save: {t('save')}</p>
            <p>Cancel: {t('cancel')}</p>
        </div>
    )
}

export const Default: Story = {
    render: () => (
        <I18nProvider locale="en" translations={{greeting: 'Hello, {name}!', save: 'Save', cancel: 'Cancel'}}>
            <TranslationDemo />
        </I18nProvider>
    ),
}

export const RTL: Story = {
    render: () => (
        <I18nProvider locale="ar" direction="rtl" translations={{greeting: 'مرحبا، {name}!', save: 'حفظ', cancel: 'إلغاء'}}>
            <TranslationDemo />
        </I18nProvider>
    ),
}

export const WithTranslations: Story = {
    render: () => (
        <I18nProvider locale="de" translations={{greeting: 'Hallo, {name}!', save: 'Speichern', cancel: 'Abbrechen'}}>
            <TranslationDemo />
        </I18nProvider>
    ),
}
