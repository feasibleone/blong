/**
 * Portal stories — demonstrate portal shell capabilities:
 * tab management, menu navigation, error handling per tab, multi-page layouts.
 *
 * Each story wraps <Portal /> inside a thin setup component that seeds the
 * Zustand app store with the desired tabs + menu config, then cleans up on
 * unmount so stories don't bleed state into each other.
 *
 * The global `withDispatch` decorator (from .storybook/preview.tsx) already
 * wraps every story in <App> providing BlongProvider + Theme context, so
 * Portal can read from the store and dispatch can be used inside tabs.
 */
import type {Meta, StoryObj} from '@storybook/react-vite';
import type {within} from '@testing-library/react';
import type {UserEvent} from '@testing-library/user-event';
import {useEffect} from 'react';
import {useAppStore} from '../../state/appStore.js';
import type {IPortalConfig, ITab} from '../../types/portal.js';
import {Basic as EditorBasic} from '../Editor/Editor.stories.js';
import {Explorer} from '../Explorer/Explorer.js';
import {Default as ExplorerDefault} from '../Explorer/Explorer.stories.js';
import {Portal} from './Portal.js';

// ── Meta ───────────────────────────────────────────────────────────────────

const meta: Meta = {
    title: 'Portal',
    parameters: {layout: 'fullscreen'},
};
export default meta;

type Story = Omit<StoryObj<typeof meta>, 'play'> & {
    play?: (ctx: {canvas: ReturnType<typeof within>; userEvent: UserEvent}) => Promise<void>;
    args?: Record<string, unknown>;
};

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Seed the portal Zustand store with tabs (and optional menu config) and
 * clean up on unmount.  Wraps Portal so stories are self-contained.
 */
function PortalSetup({tabs, portalConfig}: {tabs: ITab[]; portalConfig?: IPortalConfig}) {
    useEffect(() => {
        // Reset first to avoid bleed-through from previous stories
        useAppStore.setState({portal: {tabs: [], activeTabId: null, portalConfig: null}});
        const store = useAppStore.getState();
        tabs.forEach(tab => store.openTab(tab));
        if (portalConfig) store.setPortalConfig(portalConfig);
        return () => {
            useAppStore.setState({portal: {tabs: [], activeTabId: null, portalConfig: null}});
        };
        // eslint-disable-next-line @eslint-react/exhaustive-deps -- run once on mount
    }, []);
    return <Portal />;
}

// ── Simple page components used by multiple stories ───────────────────────

function PageOne() {
    return (
        <div style={{padding: '2rem'}}>
            <h2>Page One</h2>
            <p>This is the content of page one.</p>
        </div>
    );
}

function PageTwo() {
    return (
        <div style={{padding: '2rem'}}>
            <h2>Page Two</h2>
            <p>This is the content of page two.</p>
        </div>
    );
}

function PageThree() {
    return (
        <div style={{padding: '2rem'}}>
            <h2>Page Three</h2>
            <p>This is the content of page three.</p>
        </div>
    );
}

function ErrorPage() {
    throw new Error('This is an intentional error to test the tab error boundary');
    return null;
}

// ── Stories ────────────────────────────────────────────────────────────────

/**
 * Basic — portal with two plain-text tabs already open.
 * Demonstrates tab switching and the close-tab button.
 */
export const Basic: Story = {
    render: () => (
        <PortalSetup
            tabs={[
                {id: 'page1', actionName: 'page1', params: {}, title: 'Page 1', component: PageOne},
                {id: 'page2', actionName: 'page2', params: {}, title: 'Page 2', component: PageTwo},
            ]}
        />
    ),
};

/**
 * MultiplePages — portal with three tabs showing different content types.
 */
export const MultiplePages: Story = {
    render: () => (
        <PortalSetup
            tabs={[
                {id: 'page1', actionName: 'page1', params: {}, title: 'Page 1', component: PageOne},
                {id: 'page2', actionName: 'page2', params: {}, title: 'Page 2', component: PageTwo},
                {
                    id: 'page3',
                    actionName: 'page3',
                    params: {},
                    title: 'Page 3',
                    component: PageThree,
                },
            ]}
        />
    ),
};

MultiplePages.play = async ({canvas, userEvent}) => {
    // Switch to the second tab
    await userEvent.click(await canvas.findByText('Page 2' as never));
    await new Promise(r => setTimeout(r, 100));
    // Switch to the third tab
    await userEvent.click(await canvas.findByText('Page 3' as never));
};

/**
 * WithMenu — portal whose menubar has navigation items.
 * Clicking a menu item opens the corresponding page tab.
 *
 * The actions are registered via registerActions so openByAction can resolve them.
 */
function WithMenuStory() {
    useEffect(() => {
        const store = useAppStore.getState();
        // Configure menu
        store.setPortalConfig({
            name: 'demo',
            title: 'Demo Portal',
            menu: [
                {
                    title: 'View',
                    items: ['view.pageOne', 'view.pageTwo'],
                },
            ],
        });
        useAppStore.setState(s => ({portal: {...s.portal, tabs: [], activeTabId: null}}));
        return () => {
            useAppStore.setState({portal: {tabs: [], activeTabId: null, portalConfig: null}});
        };
    }, []);
    return <Portal />;
}

export const WithMenu: Story = {
    render: () => <WithMenuStory />,
};

WithMenu.play = async ({canvas, userEvent}) => {
    // Open the "View" menu
    await userEvent.click(await canvas.findByText('View' as never));
    await new Promise(r => setTimeout(r, 200));
    // Click "Page 1"
    await userEvent.click(await canvas.findByText('Page 1' as never));
};

/**
 * ErrorTab — one tab whose component throws an error.
 * Demonstrates the per-tab error boundary: only the failing tab shows an error
 * message; the rest of the portal remains functional.
 */
export const ErrorTab: Story = {
    render: () => (
        <PortalSetup
            tabs={[
                {id: 'ok', actionName: 'ok', params: {}, title: 'Working Tab', component: PageOne},
                {
                    id: 'error-tab',
                    actionName: 'error-tab',
                    params: {},
                    title: 'Error Tab',
                    component: ErrorPage,
                },
            ]}
        />
    ),
};

ErrorTab.play = async ({canvas, userEvent}) => {
    // Navigate to the tab with the error
    await userEvent.click(await canvas.findByText('Error Tab' as never));
};

/**
 * DirtyTab — demonstrates the unsaved-changes indicator (●) in the tab header.
 * The second tab is flagged dirty from the start.
 */
export const DirtyTab: Story = {
    render: () => (
        <PortalSetup
            tabs={[
                {id: 'clean', actionName: 'clean', params: {}, title: 'Saved', component: PageOne},
                {
                    id: 'dirty',
                    actionName: 'dirty',
                    params: {},
                    title: 'Unsaved',
                    component: PageTwo,
                    dirty: true,
                },
            ]}
        />
    ),
};

/**
 * WithEditor — portal hosting an Editor component in a tab.
 * Reuses the `Basic` story from Editor.stories — same fixture data, same layout.
 */
export const WithEditor: Story = {
    render: () => (
        <PortalSetup
            tabs={[
                {
                    id: 'editor',
                    actionName: 'editor',
                    params: {},
                    title: 'Edit Tree',
                    component: EditorBasic,
                },
            ]}
        />
    ),
};

/**
 * WithExplorer — portal hosting an Explorer component in a tab.
 * Reuses the `Default` story args from Explorer.stories — same columns, toolbar,
 * and list action.
 */
function ExplorerTab(props: Record<string, unknown>) {
    return (
        <Explorer
            {...(ExplorerDefault.args as Record<string, unknown>)}
            {...props}
        />
    );
}

export const WithExplorer: Story = {
    render: () => (
        <PortalSetup
            tabs={[
                {
                    id: 'explorer',
                    actionName: 'explorer',
                    params: {},
                    title: 'Coral List',
                    component: ExplorerTab,
                },
            ]}
        />
    ),
};
