/* spell-checker: disable */
import type {Meta, StoryObj} from '@storybook/react-vite';
import {ThemeSwitcher} from './ThemeSwitcher.js';

/**
 * ThemeSwitcher stories — the theme dropdown + dark/light mode toggle rendered
 * in the portal menubar, to the left of the language switcher.
 *
 * The global `withDispatch` decorator wraps every story in <App>, which renders
 * <Theme> — so `useTheme()` resolves and the switcher reflects the story's
 * `parameters.theme`. The decorator also resets the persisted theme choice per
 * story, so each story starts from its own `parameters.theme`.
 */
const meta: Meta<typeof ThemeSwitcher> = {
    title: 'ThemeSwitcher',
    component: ThemeSwitcher,
    parameters: {layout: 'padded'},
    tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof meta>;

/** The app default (compact + dark → Vela Blue) — a single variant, so no toggle. */
export const Default: Story = {
    render: () => <ThemeSwitcher />,
};

/** A family with both variants — a single sun/moon icon toggle is shown. */
export const FamilyWithToggle: Story = {
    render: () => <ThemeSwitcher />,
    parameters: {theme: {name: 'lara-blue'}},
};

/** A single-variant theme — no toggle. */
export const SingleVariant: Story = {
    render: () => <ThemeSwitcher />,
    parameters: {theme: {name: 'saga-blue'}},
};

/** The blong Glass variant — dark base, no toggle. */
export const Glass: Story = {
    render: () => <ThemeSwitcher />,
    parameters: {theme: {name: 'glass'}},
};

/** The blong Wood variant — dark base, no toggle. */
export const Wood: Story = {
    render: () => <ThemeSwitcher />,
    parameters: {theme: {name: 'wood'}},
};

/** Config gate — `switcher: false` renders nothing. */
export const SwitcherDisabled: Story = {
    render: () => <ThemeSwitcher />,
    parameters: {theme: {switcher: false}},
};
