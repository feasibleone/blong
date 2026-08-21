import type {Meta, StoryObj} from '@storybook/react-vite';
import {useEffect} from 'react';
import {useAppStore} from '../../state/appStore.js';
import {LanguageSwitcher} from './LanguageSwitcher.js';

/**
 * LanguageSwitcher stories — the configurable UI-language selector rendered in
 * the portal menubar, to the left of the profile menu.
 *
 * The global `withDispatch` decorator wraps every story in <App> providing
 * BlongProvider + Theme context.  Each story seeds the Zustand app store with
 * a portal config (languages + translations), then cleans up on unmount.
 */
const meta: Meta<typeof LanguageSwitcher> = {
    title: 'LanguageSwitcher',
    component: LanguageSwitcher,
    parameters: {layout: 'padded'},
    tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof meta>;

function Setup({languages}: {languages?: Array<{value: string; label: string}>}) {
    useEffect(() => {
        useAppStore.setState(s => ({
            ...s,
            language: 'en',
            translations: {},
            translationsByLanguage: {en: {}, bg: {'Profile': 'Профил'}},
            portal: {
                tabs: [],
                activeTabId: null,
                portalConfig: {
                    name: 'app',
                    title: 'App',
                    languages: languages ?? [
                        {value: 'en', label: 'English'},
                        {value: 'bg', label: 'Български'},
                    ],
                    translations: {en: {}, bg: {'Profile': 'Профил'}},
                },
            },
        }));
        return () => {
            useAppStore.setState(s => ({
                ...s,
                language: 'en',
                translations: {},
                translationsByLanguage: {},
                portal: {tabs: [], activeTabId: null, portalConfig: null},
            }));
        };
        // eslint-disable-next-line @eslint-react/exhaustive-deps -- run once on mount
    }, []);
    return <LanguageSwitcher />;
}

export const TwoLanguages: Story = {
    render: () => <Setup />,
};

export const SingleLanguage: Story = {
    render: () => (
        <Setup
            languages={[{value: 'en', label: 'English'}]}
        />
    ),
};
