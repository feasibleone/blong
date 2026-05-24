/**
 * App stories — demonstrate high-level application features:
 * portal navigation, login page, self-registration, translations.
 *
 * Pattern:
 *  - Portal stories seed Zustand state in a useEffect and render <Portal />.
 *    `auth.isAuthenticated` is set to true so the App shell shows the portal.
 *  - Login stories pass a `loginComponent` in `story.parameters.loginComponent`.
 *    The global `withDispatch` decorator forwards it to <App>, which renders it
 *    when `auth.isAuthenticated` is false.  The story's render sets auth to
 *    unauthenticated and returns null — the App handles the rest.
 *
 * Story map:
 *  WithPortal         — full app: menu + two open tabs, menu-driven navigation
 *  Navigate           — play() opens a menu item and loads a new tab
 *  BulgarianPortal    — same portal but with Bulgarian text (lang='bg')
 *  Login              — app showing the login page (unauthenticated state)
 *  BulgarianLogin     — login page in Bulgarian
 *  LoginError         — login attempt fails, error message shown in form
 */
import type {Meta, StoryObj} from '@storybook/react-vite';
import type {within} from '@testing-library/react';
import type {UserEvent} from '@testing-library/user-event';
import {useEffect} from 'react';
import type {DispatchFn} from '../../context/BlongUiContext.js';
import {useAppStore} from '../../state/appStore.js';
import type {IPortalConfig, ITab} from '../../types/portal.js';
import {Login as LoginForm} from '../Login/Login.js';
import {Portal} from '../Portal/Portal.js';

// ── Meta ───────────────────────────────────────────────────────────────────

const meta: Meta = {
    title: 'App',
    parameters: {layout: 'fullscreen'},
};
export default meta;

type Story = Omit<StoryObj<typeof meta>, 'play'> & {
    play?: (ctx: {canvas: ReturnType<typeof within>; userEvent: UserEvent}) => Promise<void>;
    args?: Record<string, unknown>;
};

// ── Page components ────────────────────────────────────────────────────────

function DashboardPage() {
    return (
        <div style={{padding: '2rem'}}>
            <h2>Dashboard</h2>
            <p>
                Welcome to the Marine Biology Portal. Select an item from the menu to get started.
            </p>
        </div>
    );
}

function SpeciesListPage() {
    return (
        <div style={{padding: '2rem'}}>
            <h2>Species List</h2>
            <p>Browse the coral species database.</p>
            <ul>
                <li>Brain Coral</li>
                <li>Staghorn Coral</li>
                <li>Sea Fan</li>
                <li>Elkhorn Coral</li>
            </ul>
        </div>
    );
}

function ReportsPage() {
    return (
        <div style={{padding: '2rem'}}>
            <h2>Reports</h2>
            <p>Generate and view statistical reports on coral populations.</p>
        </div>
    );
}

// ── Shared portal config ───────────────────────────────────────────────────

const portalConfig: IPortalConfig = {
    name: 'marine-biology',
    title: 'Marine Biology Portal',
    menu: [
        {
            title: 'Data',
            items: [
                {title: 'Species', method: 'app.species', icon: 'pi pi-list'},
                {title: 'Reports', method: 'app.reports', icon: 'pi pi-chart-bar'},
            ],
        },
    ],
};

const portalInitialTabs: ITab[] = [
    {
        id: 'dashboard',
        actionName: 'dashboard',
        params: {},
        title: 'Dashboard',
        component: DashboardPage,
    },
];

// ── Helper: seed portal store ──────────────────────────────────────────────

function PortalApp({tabs, portalConfig}: {tabs: ITab[]; portalConfig?: IPortalConfig}) {
    useEffect(() => {
        useAppStore.setState({portal: {tabs: [], activeTabId: null, portalConfig: null}});
        const store = useAppStore.getState();
        // Authenticate so the App shell shows the portal (not the login page).
        store.setToken('demo-token');
        tabs.forEach(tab => store.openTab(tab));
        if (portalConfig) store.setPortalConfig(portalConfig);
        // Register page actions for menu navigation
        store.registerActions({
            'app.species': {title: 'Species', component: () => Promise.resolve(SpeciesListPage)},
            'app.reports': {title: 'Reports', component: () => Promise.resolve(ReportsPage)},
        });
        return () => {
            useAppStore.setState({portal: {tabs: [], activeTabId: null, portalConfig: null}});
            store.logout();
        };
    }, [tabs, portalConfig]);
    return <Portal />;
}

// ── Login page components (used via parameters.loginComponent) ────────────────

/**
 * MarineTitleComponent — pluggable header slot above the brand area.
 */
function MarineTitleComponent() {
    return (
        <div style={{textAlign: 'center', marginBottom: '0.5rem'}}>
            <div style={{color: 'var(--text-color)', fontSize: '1.1rem', fontWeight: 500}}>
                Marine Biology Research Platform
            </div>
            <div style={{color: 'var(--text-color-secondary)', fontSize: '0.875rem'}}>
                Data collection &amp; analysis
            </div>
        </div>
    );
}

/**
 * LoginPage — basic login wrapping Login component.
 * Clicking "Sign In" sets a demo token (transitions App shell to portal).
 */
function LoginPage(_: {dispatch: DispatchFn}) {
    return (
        <LoginForm
            onLogin={async () => {
                await new Promise(r => setTimeout(r, 800));
                useAppStore.getState().setToken('demo-token');
            }}
            title="Marine Biology Portal"
            logoIcon="pi pi-globe"
        />
    );
}

/**
 * MarineOrgComponent — org brand slot below the login card.
 * Equal height to the product area above, keeping the card centred.
 */
function MarineOrgComponent() {
    return (
        <div style={{textAlign: 'center', opacity: 0.75}}>
            <div
                style={{
                    color: 'var(--text-color-secondary)',
                    fontSize: '0.8rem',
                    marginBottom: '0.25rem',
                }}
            >
                Powered by
            </div>
            <div
                style={{color: 'var(--text-color-secondary)', fontSize: '0.95rem', fontWeight: 500}}
            >
                FeasibleOne Platform
            </div>
        </div>
    );
}

/**
 * LoginPageWithTitle — demonstrates the `titleComponent` slot (product area) above the brand
 * and the `orgComponent` slot (org brand area) below — both equal-height to keep the card centred.
 */
function LoginPageWithTitle(_: {dispatch: DispatchFn}) {
    return (
        <LoginForm
            onLogin={async () => {
                await new Promise(r => setTimeout(r, 800));
                useAppStore.getState().setToken('demo-token');
            }}
            title="Marine Biology Portal"
            logoIcon="pi pi-globe"
            titleComponent={MarineTitleComponent}
            orgComponent={MarineOrgComponent}
        />
    );
}

/**
 * LoginPageWithRegister — demonstrates `registerPage` registration mechanism.
 * - Shows a "Register" button in the top-right corner.
 * - Clicking it dispatches `component/xxx` with page `'user.selfRegistration'`.
 * - The global dispatch mock returns a placeholder registration form for page names
 *   ending in 'Registration' / 'Register' / 'SelfRegister'.
 */
function LoginPageWithRegister(_: {dispatch: DispatchFn}) {
    return (
        <LoginForm
            onLogin={async () => {
                await new Promise(r => setTimeout(r, 800));
                useAppStore.getState().setToken('demo-token');
            }}
            title="Marine Biology Portal"
            logoIcon="pi pi-globe"
            titleComponent={MarineTitleComponent}
            orgComponent={MarineOrgComponent}
            registerPage="user.selfRegistration"
        />
    );
}

/** Same as LoginPage but with Bulgarian title (i18n demo). */
function BulgarianLoginPage(_: {dispatch: DispatchFn}) {
    return (
        <LoginForm
            onLogin={async () => {
                await new Promise(r => setTimeout(r, 800));
                useAppStore.getState().setToken('demo-token');
            }}
            title="Портал за морска биология"
            logoIcon="pi pi-globe"
        />
    );
}

/** Login page that always rejects — demonstrates the inline error message. */
function LoginErrorPage(_: {dispatch: DispatchFn}) {
    return (
        <LoginForm
            onLogin={async () => {
                await new Promise(r => setTimeout(r, 500));
                throw new Error('Invalid username or password');
            }}
            title="Marine Biology Portal"
            logoIcon="pi pi-globe"
        />
    );
}

// ── Stories ────────────────────────────────────────────────────────────────

/**
 * WithPortal — the full authenticated application shell.
 * Dashboard tab is open by default; the menu lets the user open Species/Reports.
 */
export const WithPortal: Story = {
    render: () => (
        <PortalApp
            tabs={portalInitialTabs}
            portalConfig={portalConfig}
        />
    ),
};

/**
 * Navigate — play() opens the Data menu and navigates to the Species page.
 */
export const Navigate: Story = {
    render: () => (
        <PortalApp
            tabs={portalInitialTabs}
            portalConfig={portalConfig}
        />
    ),
    play: async ({canvas, userEvent}) => {
        // Open the 'Data' sub-menu
        await userEvent.click(await canvas.findByText('Data' as never));
        // Click the 'Species' item
        await userEvent.click(await canvas.findByText('Species' as never));
        await new Promise(r => setTimeout(r, 300));
    },
};

/**
 * BulgarianPortal — authenticated portal with Bulgarian UI labels.
 * Pass `lang: 'bg'` — the global decorator translates PrimeReact widgets + store labels.
 */
export const BulgarianPortal: Story = {
    args: {lang: 'bg'},
    render: () => (
        <PortalApp
            tabs={[
                {
                    id: 'dashboard',
                    actionName: 'dashboard',
                    params: {},
                    title: 'Табло',
                    component: DashboardPage,
                },
            ]}
            portalConfig={{
                ...portalConfig,
                title: 'Портал за морска биология',
                menu: [
                    {
                        title: 'Данни',
                        items: [
                            {title: 'Видове', method: 'app.species', icon: 'pi pi-list'},
                            {title: 'Справки', method: 'app.reports', icon: 'pi pi-chart-bar'},
                        ],
                    },
                ],
            }}
        />
    ),
};

/** Ensures the app is in unauthenticated state when the story mounts. */
function LogoutOnMount() {
    useEffect(() => {
        useAppStore.getState().logout();
    }, []);
    return <></>;
}

/**
 * Login — app in unauthenticated state: shows the login form with brand area.
 * The `loginComponent` parameter is forwarded to <App> by the global `withDispatch`
 * decorator. App renders it when `auth.isAuthenticated` is false.
 * Clicking Login sets a demo token and transitions to the portal.
 */
export const Login: Story = {
    parameters: {loginComponent: LoginPage},
    render: () => <LogoutOnMount />,
};

/**
 * LoginWithTitle — login screen with the pluggable `titleComponent` slot above
 * the brand area.
 */
export const LoginWithTitle: Story = {
    parameters: {loginComponent: LoginPageWithTitle},
    render: () => <LogoutOnMount />,
};
LoginWithTitle.storyName = 'Login With Title';

/**
 * LoginWithRegister — login screen with a "Register" button.
 * Clicking Register dispatches `component/xxx` with page `'user.selfRegistration'`.
 * The global mock returns a placeholder registration component for page names
 * ending with 'Registration', 'Register', or 'SelfRegister'.
 */
export const LoginWithRegister: Story = {
    parameters: {loginComponent: LoginPageWithRegister},
    render: () => <LogoutOnMount />,
};
LoginWithRegister.storyName = 'Login With Register';

/**
 * BulgarianLogin — login page in Bulgarian.
 */
export const BulgarianLogin: Story = {
    args: {lang: 'bg'},
    parameters: {loginComponent: BulgarianLoginPage},
    render: () => <LogoutOnMount />,
};
BulgarianLogin.storyName = 'Bulgarian Login';

/**
 * LoginError — login attempt always fails; demonstrates the inline form error state.
 */
export const LoginError: Story = {
    parameters: {loginComponent: LoginErrorPage},
    play: async ({canvas, userEvent}) => {
        await userEvent.type(await canvas.findByLabelText('Username' as never), 'testuser');
        await userEvent.type(await canvas.findByLabelText('Password' as never), 'wrongpass');
        await userEvent.click(await canvas.findByRole('button' as never, {name: /^login$/i}));
    },
    render: () => <LogoutOnMount />,
};
