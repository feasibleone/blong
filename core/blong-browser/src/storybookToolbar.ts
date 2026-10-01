/**
 * storybookToolbar — the Storybook toolbar for Blong stories.
 *
 * Five choices, each a Storybook global, all persisted in `localStorage` so a
 * reload keeps the state a reviewer left behind:
 *
 *  - `backend` — where a story reads its data from: the in-memory fixture mock
 *    (`mock`), a live gateway over plain JSON-RPC (`jsonrpc`), or a live
 *    gateway with end-to-end encryption (`mle`).  Only the realm/suite preview
 *    offers this item — `blong-browser`'s own component stories have no
 *    platform and therefore no adapter to point anywhere.
 *  - `role` — the role the live back end is reached with (`Admin`, `Manager`,
 *    `Guest`, …).  The Storybook dev-server plugin turns it into a token, so
 *    the stories never see a login screen.
 *  - `theme`, `language`, `direction` — presentation.  On the realm/suite path
 *    the platform owns `<Theme>`, so there is no prop to write to: these are
 *    applied to the app store instead, which `<Theme>` already prefers over its
 *    config (see `selection.direction` in `Theme.tsx`).  They are useful
 *    precisely for stories that render components rather than the portal shell,
 *    because no story renders the portal menubar that carries the switchers.
 *
 * The items are declared here rather than in each `.storybook/preview.tsx` so
 * that the realm previews, `blong-browser`'s own preview and the kukum
 * template cannot drift; a preview only calls the factory.
 *
 * Storybook passes the current globals to a decorator whose position in the
 * `decorators` array is *outside* the story's own decorator, so the effect that
 * applies them runs last.  That matters for `blong-browser`'s preview, whose
 * `withDispatch` resets the store on every story.
 */
import {THEME_OPTIONS} from './components/Theme/themeRegistry.js';
import {useAppStore} from './state/appStore.js';

/** Key the toolbar remembers its choices under. */
export const STORYBOOK_CHOICES_KEY = 'blong.storybook';

/** Where a story reads its data. */
export type StorybookBackend = 'mock' | 'jsonrpc' | 'mle';

/** The presentation choices the toolbar drives. */
export type StorybookDirection = 'ltr' | 'rtl';

/** Every choice the toolbar carries, as read from the globals. */
export interface IBlongStorybookOptions {
    backend?: StorybookBackend;
    role?: string;
    theme?: string;
    language?: string;
    direction?: StorybookDirection;
}

/** Options for {@link blongStorybookToolbar}. */
export interface IBlongStorybookToolbarOptions {
    /**
     * Offer the `backend` and `role` items.  Defaults to `false`; a preview of
     * a realm or suite passes `true` (its stories run on a platform with a
     * backend adapter, so there is something to switch).
     */
    backend?: boolean;
    /**
     * Roles the `role` item offers, in display order.  Defaults to the roles
     * the Storybook dev-server plugin found in `.blong_devrc`, falling back to
     * the seeded test users (`Admin`, `Manager`, `Guest`).
     */
    roles?: string[];
    /** Languages the `language` item offers.  Defaults to `en` and `bg`. */
    languages?: string[];
}

const DEFAULT_BACKEND: StorybookBackend = 'mock';
/** `vela-blue` is the folder the default `compact`/`dark` theme maps to. */
const DEFAULT_THEME = 'vela-blue';
const DEFAULT_LANGUAGE = 'en';
const DEFAULT_DIRECTION: StorybookDirection = 'ltr';
const DEFAULT_ROLES = ['Admin', 'Manager', 'Guest'];
const DEFAULT_LANGUAGES = ['en', 'bg'];
const BACKEND_VALUES = ['mock', 'jsonrpc', 'mle'] as const;
const DIRECTION_VALUES = ['ltr', 'rtl'] as const;

const BACKENDS: {value: StorybookBackend; title: string; description: string}[] = [
    {value: 'mock', title: 'Mock', description: 'In-memory fixture rows, no back end'},
    {value: 'jsonrpc', title: 'Live (JSON-RPC)', description: 'Real gateway, plain JSON-RPC'},
    {value: 'mle', title: 'Live (MLE)', description: 'Real gateway, end-to-end encrypted'},
];

/**
 * Backend/role list injected by the Storybook dev-server plugin
 * (`define: {__BLONG_STORYBOOK__: …}`).  Absent when no back end was
 * configured, which is why every read falls back to a default.
 */
interface IInjectedStorybookConfig {
    roles?: string[];
    target?: string;
}

function injectedConfig(): IInjectedStorybookConfig {
    const injected = (globalThis as {__BLONG_STORYBOOK__?: IInjectedStorybookConfig})
        .__BLONG_STORYBOOK__;
    return injected && typeof injected === 'object' ? injected : {};
}

function storedChoices(): IBlongStorybookOptions {
    if (typeof localStorage === 'undefined') return {};
    try {
        const raw = localStorage.getItem(STORYBOOK_CHOICES_KEY);
        return raw ? (JSON.parse(raw) as IBlongStorybookOptions) : {};
    } catch {
        return {};
    }
}

/**
 * Remember the choices a decorator observed.  Only the choices the app store
 * does not already persist are written here (theme and direction live in
 * `blong.theme`), so the toolbar and the portal's own theme switcher agree.
 */
export function writeStorybookChoices(options: IBlongStorybookOptions): void {
    if (typeof localStorage === 'undefined') return;
    try {
        const {backend, role, language} = options;
        localStorage.setItem(STORYBOOK_CHOICES_KEY, JSON.stringify({backend, role, language}));
    } catch {
        // Ignore storage failures (private mode, quota, …).
    }
}

/**
 * The theme the app's own switcher last persisted, if any.  Read here so a
 * story opens in the theme the rest of the portal is already showing.
 */
function storedThemeId(): string | undefined {
    if (typeof localStorage === 'undefined') return undefined;
    try {
        const raw = localStorage.getItem('blong.theme');
        const selection = raw ? (JSON.parse(raw) as {themeId?: unknown}) : {};
        return typeof selection.themeId === 'string' ? selection.themeId : undefined;
    } catch {
        return undefined;
    }
}

/**
 * The globals a preview starts from.  Storybook's own `?globals=` URL
 * parameter outranks these, which is what makes a state scriptable.
 */
export function blongStorybookInitialGlobals(
    options: IBlongStorybookToolbarOptions = {},
): Record<string, string> {
    const stored = storedChoices();
    const roles = options.roles ?? injectedConfig().roles ?? DEFAULT_ROLES;
    const languages = options.languages ?? DEFAULT_LANGUAGES;
    return {
        ...(options.backend
            ? {
                  backend: stored.backend ?? DEFAULT_BACKEND,
                  role: stored.role && roles.includes(stored.role) ? stored.role : roles[0],
              }
            : {}),
        theme: storedThemeId() ?? stored.theme ?? DEFAULT_THEME,
        language:
            stored.language && languages.includes(stored.language)
                ? stored.language
                : DEFAULT_LANGUAGE,
        direction: DEFAULT_DIRECTION,
    };
}

/**
 * The `globalTypes` entry for the toolbar.  `dynamicTitle` puts the current
 * value in the toolbar button, so a screenshot shows which state it captured.
 */
export function blongStorybookGlobalTypes(
    options: IBlongStorybookToolbarOptions = {},
): Record<string, unknown> {
    const roles = options.roles ?? injectedConfig().roles ?? DEFAULT_ROLES;
    const languages = options.languages ?? DEFAULT_LANGUAGES;
    return {
        ...(options.backend
            ? {
                  backend: {
                      description: 'Where the story reads its data from',
                      toolbar: {
                          title: 'Backend',
                          icon: 'database' as const,
                          items: BACKENDS,
                          dynamicTitle: true,
                      },
                  },
                  role: {
                      description: 'Role the live back end is reached with',
                      toolbar: {
                          title: 'Role',
                          icon: 'user' as const,
                          items: roles.map(role => ({value: role, title: role})),
                          dynamicTitle: true,
                      },
                  },
              }
            : {}),
        theme: {
            description: 'Theme variant',
            toolbar: {
                title: 'Theme',
                icon: 'paintbrush' as const,
                items: THEME_OPTIONS.map(option => ({value: option.id, title: option.label})),
                dynamicTitle: true,
            },
        },
        language: {
            description: 'Interface language',
            toolbar: {
                title: 'Language',
                icon: 'globe' as const,
                items: languages.map(language => ({value: language, title: language})),
                dynamicTitle: true,
            },
        },
        direction: {
            description: 'Text direction',
            toolbar: {
                title: 'Direction',
                icon: 'mirror' as const,
                items: [
                    {value: 'ltr', title: 'LTR'},
                    {value: 'rtl', title: 'RTL'},
                ],
                dynamicTitle: true,
            },
        },
    };
}

/** `globalTypes` + `initialGlobals`, ready to spread into a preview. */
export function blongStorybookToolbar(options: IBlongStorybookToolbarOptions = {}): {
    globalTypes: Record<string, unknown>;
    initialGlobals: Record<string, string>;
} {
    return {
        globalTypes: blongStorybookGlobalTypes(options),
        initialGlobals: blongStorybookInitialGlobals(options),
    };
}

/** The subset of the Storybook context the toolbar reads. */
export interface IBlongStorybookContext {
    globals?: Record<string, unknown>;
}

function asValue<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
    return typeof value === 'string' && (allowed as readonly string[]).includes(value)
        ? (value as T)
        : undefined;
}

/**
 * Read the toolbar's choices out of the Storybook context and remember them.
 *
 * Typed by hand rather than with Storybook's `Decorator` so that this module
 * (and the `./storybook` entry it is exported from) does not depend on the
 * Storybook packages at build time.
 */
export function blongStorybookGlobals(context?: IBlongStorybookContext): IBlongStorybookOptions {
    const globals = context?.globals ?? {};
    const options: IBlongStorybookOptions = {
        backend: asValue(globals.backend, BACKEND_VALUES),
        role: typeof globals.role === 'string' ? globals.role : undefined,
        theme: typeof globals.theme === 'string' ? globals.theme : undefined,
        language: typeof globals.language === 'string' ? globals.language : undefined,
        direction: asValue(globals.direction, DIRECTION_VALUES),
    };
    writeStorybookChoices(options);
    return options;
}

/**
 * The choices the reviewer actually changed — the globals that differ from the
 * ones the preview started from.
 *
 * Only those are applied.  A story may set its own `args.lang` or
 * `parameters.theme` (the Validation story renders in Bulgarian that way), and
 * the toolbar's *default* must not quietly override it: a reviewer who has not
 * touched the toolbar has expressed no opinion about the presentation.
 */
export function changedStorybookGlobals(
    options: IBlongStorybookOptions,
    initial: Record<string, unknown>,
): IBlongStorybookOptions {
    const changed: IBlongStorybookOptions = {};
    if (options.theme && options.theme !== initial.theme) changed.theme = options.theme;
    if (options.direction && options.direction !== initial.direction) {
        changed.direction = options.direction;
    }
    if (options.language && options.language !== initial.language) {
        changed.language = options.language;
    }
    return changed;
}

/**
 * Write the presentation globals into the app store.
 *
 * Separate from the decorator so it can be unit-tested without a renderer, and
 * *idempotent*: a no-op when the store already holds the wanted value, because
 * `setTheme` persists to `localStorage` and re-writing it on every story would
 * be noise.
 */
export function applyStorybookGlobals(
    store: Pick<
        ReturnType<typeof useAppStore.getState>,
        'theme' | 'language' | 'setTheme' | 'setDirection' | 'setLanguage'
    >,
    options: IBlongStorybookOptions,
): void {
    const {theme, direction, language} = options;
    if (theme && store.theme.themeId !== theme) {
        store.setTheme({...store.theme, themeId: theme});
    }
    if (direction && store.theme.direction !== direction) {
        store.setDirection(direction);
    }
    if (language && store.language !== language) {
        store.setLanguage(language);
    }
}
