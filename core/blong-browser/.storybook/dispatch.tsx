/**
 * Centralized story dispatch mock — shared across all Storybook stories.
 *
 * Each story that needs data simply points its `loadAction` / `saveAction` to
 * one of the named handlers below. No per-story decorator is needed:
 *
 *   Loading.args = {loadAction: 'treeTreeLoad'};  // never resolves → skeleton
 *   Design.args  = {loadAction: 'treeTreeGet'};   // returns fixture data
 *   ServerValidation.args = {saveAction: 'treeTreeEditError'};
 *
 * Per-story `decorators` with `withDispatch` overrides are only needed for
 * behaviour that cannot be expressed as a named action (rare).
 *
 * ## Toast notifications
 *
 * `makeDispatch` and `withDispatch` accept a `notify` option that controls which
 * handler calls show a success toast after resolving. By default, read-only and
 * background handlers are excluded; all mutation handlers show a toast with the
 * method name and the JSON-serialised result.
 *
 * To see toasts for specific actions in a per-story decorator:
 *
 *   MyStory.decorators = [withDispatch({}, {notify: ['marine.coral.add', 'marine.coral.edit']})];
 *
 * To suppress all toasts for a story:
 *
 *   MyStory.decorators = [withDispatch({}, {notify: false})];
 */
import React from 'react';
import { App } from '../src/components/App/index.js';
import { Hint } from '../src/components/Hint/index.js';
import type { DispatchFn } from '../src/context/BlongUiContext.js';
import { blongEvents } from '../src/lib/eventBus.js';
import { useAppStore } from '../src/state/appStore.js';
import type { IBlongError } from '../src/types/action.js';

/**
 * Controls which dispatch calls show a Storybook toast on success:
 * - `false` (default for makeDispatch) — no toasts
 * - `true` — all handlers
 * - `string[]` — only the listed method names
 * - `(method) => boolean` — custom predicate
 */
export type NotifyConfig = boolean | string[] | ((method: string) => boolean);

/**
 * Default notify config used by `withDispatch`.
 * Shows toasts for every handler EXCEPT known read-only / background ones:
 * portal.dropdown.list, and methods ending with Get/Load/Find/List/Fetch.
 */
const DEFAULT_NOTIFY: NotifyConfig = (method: string) => {
    if (method === 'portal.dropdown.list') return false;
    if (/(?:Get|Load|Find|List|Fetch)$/i.test(method)) return false;
    return true;
};

function shouldNotify(notify: NotifyConfig, method: string): boolean {
    if (notify === false) return false;
    if (notify === true) return true;
    if (Array.isArray(notify)) return notify.includes(method);
    if (typeof notify === 'function') return notify(method);
    return false;
}

// ── Tree fixture data ──────────────────────────────────────────────────────────

export const treeValue = {
    treeName: 'Oak',
    treeId: 1,
    treeType: 1,
    createdOn: new Date('2023-03-08'),
    links: [
        {title: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Oak'},
        {title: 'GBIF', url: 'https://www.gbif.org/species/2878688'},
    ],
};

export const treeDropdownData: Record<string, {value: number; label: string}[]> = {
    'tree.type': [
        {value: 1, label: 'Conifer'},
        {value: 2, label: 'Broadleaf'},
    ],
    'tree.habitat': [
        {value: 1, label: 'Forests'},
        {value: 2, label: 'Plantations'},
        {value: 3, label: 'Riverbanks'},
        {value: 4, label: 'Rivers'},
        {value: 5, label: 'Rocky areas'},
        {value: 6, label: 'Urban'},
        {value: 7, label: 'Wetlands'},
    ],
};

// ── Handlers ───────────────────────────────────────────────────────────────────

export type Handler = (params?: Record<string, unknown>) => Promise<unknown>;

/**
 * All named handlers available to stories via `loadAction` / `saveAction`.
 *
 * Naming convention:
 *   <entity><Entity>Get      — load, resolves immediately with fixture data
 *   <entity><Entity>Load     — load, never resolves (skeleton / loading state)
 *   <entity><Entity>Edit     — save, success (echoes params back)
 *   <entity><Entity>EditError — save, server validation failure
 *   <entity><Entity>Find     — list/search, returns empty result set
 */
export const defaultHandlers: Record<string, Handler> = {
    // ── Tree entity ────────────────────────────────────────────────────────────

    /** Load — resolves immediately with fixture data. */
    treeTreeGet: () => Promise.resolve(treeValue),

    /** Load — never resolves; use as `loadAction` to show skeleton indefinitely. */
    treeTreeLoad: () => new Promise(() => {}),

    /** Save — echoes the submitted params back as the persisted value. */
    treeTreeEdit: params => Promise.resolve(params),

    /** Save — rejects with server-side field validation errors. */
    treeTreeEditError: () => {
        const err = new Error('Server validation failed') as Error & IBlongError;
        err.print = 'server validation message';
        err.validation = [
            {field: 'treeName', message: 'Duplicate name'},
            {field: 'treeType', message: 'Invalid Type'},
        ];
        return Promise.reject(err);
    },

    /** Load — rejects with an auth error; use as `loadAction` to show session-expired dialog. */
    treeTreeGetError: () =>
        Promise.reject({
            type: 'identity.unauthenticated',
            message: 'Not authenticated',
            print: 'Your session has expired. Please log in again.',
        } satisfies IBlongError),

    /** Find — returns an empty result set (explorer list). */
    treeTreeFind: () => Promise.resolve({items: [], total: 0}),

    // ── Item entity ────────────────────────────────────────────────────────────

    /** Find — returns an empty result set (explorer list). */
    itemItemFind: () => Promise.resolve({items: [], total: 0}),

    // ── Dropdown batch ─────────────────────────────────────────────────────────

    /**
     * Handle named-dropdown requests from DropdownWidget.
     * Names ending in `Error` reject — use `dropdown: 'tree.typeError'` in the
     * widget schema to trigger the failure path (see DropdownError story).
     */
    'portal.dropdown.list': params => {
        const names = (params?.names ?? []) as string[];
        if (names.some(n => n.endsWith('Error'))) {
            return Promise.reject({
                type: 'identity.unauthenticated',
                message: 'Not authenticated',
                print: 'Your session has expired. Please log in again.',
            } satisfies IBlongError);
        }
        return Promise.resolve(Object.fromEntries(names.map(n => [n, treeDropdownData[n] ?? []])));
    },
};

// ── Dispatch function ──────────────────────────────────────────────────────────

/**
 * Build a DispatchFn that routes calls to `defaultHandlers` merged with
 * `overrides`.  Used internally by `withDispatch`; also exported for unit tests
 * that need a standalone dispatch without a React tree.
 */
export function makeDispatch(
    overrides: Record<string, Handler> = {},
): DispatchFn {
    const handlers = {...defaultHandlers, ...overrides};
    return async (method, params) => {
        const handler = handlers[method];
        if (handler) return handler(params);
        console.info('[storybook dispatch] unhandled:', method, params);
        return undefined;
    };
}

// ── Global decorator ───────────────────────────────────────────────────────────

/**
 * withDispatch — global Storybook decorator (used in preview.tsx).
 *
 * - Registers all handler names as query actions so `useAction` uses the
 *   TanStack Query path, which exposes `loading: true` while a promise is pending.
 * - Wraps every story in `<App>` with the shared dispatch.
 *
 * Per-story decorators with overrides are only needed when behaviour cannot be
 * expressed as a named action.
 */
export function withDispatch(
    overrides: Record<string, Handler> = {},
    {
        loginRoute = '/login',
        notify = DEFAULT_NOTIFY,
    }: {loginRoute?: string; notify?: NotifyConfig} = {},
): (Story: React.ComponentType) => React.ReactElement {
    const dispatch = makeDispatch(overrides);
    // Register query (read) actions so TanStack Query can show loading state.
    // Register mutation (write) actions with mutates:true so they are NOT
    // auto-fetched by TanStack Query — only called when explicitly invoked.
    const isReadAction = (name: string) =>
        name === 'portal.dropdown.list' ||
        /(?:Get|Load|Find|List|Fetch)(?:Error)?$/i.test(name);
    const actionEntries = Object.fromEntries(
        Object.keys({...defaultHandlers, ...overrides}).map(name => [
            name,
            isReadAction(name) ? {method: name} : {method: name, mutates: true},
        ]),
    );

    return Story => {
        React.useEffect(() => {
            useAppStore.getState().registerActions(actionEntries);

            // Subscribe to action success events and show a toast based on notify config
            const off = blongEvents.on('action:success', ({method, result}) => {
                if (!shouldNotify(notify, method)) return;
                useAppStore.getState().showToast({
                    severity: 'success',
                    summary: method,
                    life: 30000,
                    detail: (
                        <pre
                            style={{
                                margin: 0,
                                fontSize: '0.75rem',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all',
                            }}
                        >
                            {JSON.stringify(result, null, 2)}
                        </pre>
                    ),
                });
            });

            return off;
        }, []);

        // Clear stale error/toast state each time a different story is rendered.
        // The decorator is a stable React component instance across navigations, so
        // only a Story-dependent effect re-runs on navigation.
        React.useEffect(() => {
            useAppStore.getState().clearError();
            useAppStore.getState().clearAllToasts();
        }, [Story]);

        return (
            <App
                dispatch={dispatch}
                schemaUrl="/schema.json"
                theme={{name: 'vela-blue', palette: 'dark-compact'}}
                loginRoute={loginRoute}
            >
                <Story />
                <Hint />
            </App>
        );
    };
}
