/**
 * Centralized story dispatch mock — shared across all Storybook stories.
 *
 * Each story that needs data simply points its `loadAction` / `saveAction` to
 * one of the named handlers below. No per-story decorator is needed:
 *
 *   Loading.args = {loadAction: 'coralCoralLoad'};  // never resolves → skeleton
 *   Design.args  = {loadAction: 'coralCoralGet'};   // returns fixture data
 *   ServerValidation.args = {saveAction: 'coralCoralEditError'};
 *
 * Per-story `decorators` with `withDispatch` overrides are only needed for
 * behavior that cannot be expressed as a named action (rare).
 *
 * ## Toast notifications
 *
 * `makeDispatch` and `withDispatch` accept a `notify` option that controls which
 * handler calls show a success toast after resolving. By default, read-only and
 * background handlers are excluded; all mutation handlers show a toast with the
 * method name and the JSON-serialized result.
 *
 * To see toasts for specific actions in a per-story decorator:
 *
 *   MyStory.decorators = [withDispatch({}, {notify: ['marine.coral.add', 'marine.coral.edit']})];
 *
 * To suppress all toasts for a story:
 *
 *   MyStory.decorators = [withDispatch({}, {notify: false})];
 */
import {
    coralCategoryFixtures,
    coralFixtures,
    coralStoryValue,
    marineDropdownData,
} from '@feasibleone/blong-marine/meta/storybook.js';
import React from 'react';
import {App} from '../src/components/App/index.js';
import {Hint} from '../src/components/Hint/index.js';
import type {DispatchFn} from '../src/context/BlongUiContext.js';
import type {IModelSpec} from '../src/index.js';
import {blongEvents} from '../src/lib/eventBus.js';
import {useAppStore} from '../src/state/appStore.js';
import type {IBlongError} from '../src/types/action.js';

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

// ── Translation helpers ────────────────────────────────────────────────────────

/**
 * Parse a block of `Key=Translation` lines into a translation dictionary.
 * Blank lines and lines where key === value are ignored.
 * Only the first `=` is used as separator, so values may contain `=`.
 */
function parseTranslations(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const raw of content.trim().split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        const eq = line.indexOf('=');
        if (eq < 0) continue;
        const key = line.slice(0, eq).trim();
        const val = line.slice(eq + 1).trim();
        if (key && val && key !== val) result[key] = val;
    }
    return result;
}

/* spell-checker: disable */
/**
 * PrimeReact locale data keyed by language code.
 * Each entry is passed as `theme.languages` so the Theme component registers it via addLocale.
 * Source: https://github.com/primefaces/primelocale
 */
const primeLocales: Record<string, object> = {};

/**
 * Official Bulgarian locale for PrimeReact widgets (calendar, dropdown, etc.).
 * Source: https://github.com/primefaces/primelocale/blob/main/bg.json
 */
const bgPrimeLocale = {
    accept: 'Да',
    addRule: 'Добавяне на условие',
    am: 'AM',
    apply: 'Приложи',
    cancel: 'Отказ',
    choose: 'Избор',
    chooseDate: 'Изберете Дата',
    chooseMonth: 'Изберете месец',
    chooseYear: 'Изберете година',
    clear: 'Изчистване',
    completed: 'Завършено',
    contains: 'Съдържа',
    custom: 'Персонализиран',
    dateAfter: 'Датата е след',
    dateBefore: 'Датата е преди',
    dateFormat: 'dd/mm/yy',
    dateIs: 'Датата е',
    dateIsNot: 'Дататата не е',
    dayNames: ['Неделя', 'Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота'],
    dayNamesMin: ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
    dayNamesShort: ['Нед', 'Пон', 'Вто', 'Сря', 'Чет', 'Пет', 'Съб'],
    emptyFilterMessage: 'Няма налична информация',
    emptyMessage: 'Не са открити резултати',
    emptySearchMessage: 'Няма намерени резултати',
    emptySelectionMessage: 'Няма избран елемент',
    endsWith: 'Завършва на',
    equals: 'Равно е на',
    fileChosenMessage: '{0} файла',
    fileSizeTypes: ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
    filter: 'Филтър',
    firstDayOfWeek: 1,
    gt: 'По-голямо от',
    gte: 'По-голямо или равно на',
    lt: 'По-малко от',
    lte: 'По-малко или равно на',
    matchAll: 'Съвпадение на всички',
    matchAny: 'Съвпадение на някое',
    medium: 'Средна',
    monthNames: [
        'Януари',
        'Февруари',
        'Март',
        'Април',
        'Май',
        'Юни',
        'Юли',
        'Август',
        'Септември',
        'Октомври',
        'Ноември',
        'Декември',
    ],
    monthNamesShort: [
        'Яну',
        'Фев',
        'Мар',
        'Апр',
        'Май',
        'Юни',
        'Юли',
        'Авг',
        'Сеп',
        'Окт',
        'Ное',
        'Дек',
    ],
    nextDecade: 'Следващото десетилетие',
    nextHour: 'Следващият час',
    nextMinute: 'Следващата минута',
    nextMonth: 'Следващият месец',
    nextSecond: 'Следваща секунда',
    nextYear: 'Следващата година',
    noFileChosenMessage: 'Няма избран файл',
    noFilter: 'Без филтър',
    notContains: 'Не съдържа',
    notEquals: 'Не е равно на',
    now: 'Сега',
    passwordPrompt: 'Въведете парола',
    pending: 'В очакване',
    pm: 'PM',
    prevDecade: 'Предишното десетилетие',
    prevHour: 'Предишен час',
    prevMinute: 'Предишна минута',
    prevMonth: 'Предишния месец',
    prevSecond: 'Предишен втори',
    prevYear: 'Предходната година',
    reject: 'Не',
    removeRule: 'Премахване на условие',
    searchMessage: 'Налични са {0} резултата',
    selectionMessage: '{0} избрани елемента',
    showMonthAfterYear: false,
    startsWith: 'Започва с',
    strong: 'Добра',
    today: 'Днес',
    upload: 'Качване',
    weak: 'Слаба',
    weekHeader: 'Сд',
    aria: {
        cancelEdit: 'Отказ Редактиране',
        close: 'Близо',
        collapseLabel: 'Свиване',
        collapseRow: 'Редът е свит',
        editRow: 'Редактиране на ред',
        expandLabel: 'Разширяване',
        expandRow: 'Редът е разширен',
        falseLabel: 'Невярно',
        filterConstraint: 'Ограничение на филтъра',
        filterOperator: 'Филтър оператор',
        firstPageLabel: 'Първа страница',
        gridView: 'Мрежов изглед',
        hideFilterMenu: 'Скриване на менюто за филтриране',
        jumpToPageDropdownLabel: 'Отидете до падащото меню на страницата',
        jumpToPageInputLabel: 'Преминете към Въвеждане на страница',
        lastPageLabel: 'Последна страница',
        listLabel: 'Списък с опции',
        listView: 'Списъчен изглед',
        maximizeLabel: 'Максимизиране',
        minimizeLabel: 'Минимизиране',
        moveAllToSource: 'Преместете всички в източника',
        moveAllToTarget: 'Преместете всички в целта',
        moveBottom: 'Преместване на дъното',
        moveDown: 'Преместване надолу',
        moveTop: 'Преместване отгоре',
        moveToSource: 'Преместване към източника',
        moveToTarget: 'Преместете се в Target',
        moveUp: 'Преместване нагоре',
        navigation: 'Навигация',
        next: 'Следващия',
        nextPageLabel: 'Следваща страница',
        nullLabel: 'Не е избрано',
        otpLabel: 'Моля, въведете еднократна парола {0}',
        pageLabel: 'Страница {страница}',
        passwordHide: 'Скриване на паролата',
        passwordShow: 'Покажи парола',
        previous: 'Предишен',
        prevPageLabel: 'Предишна страница',
        removeLabel: 'Премахване',
        rotateLeft: 'Завърти наляво',
        rotateRight: 'Завъртане надясно',
        rowsPerPageLabel: 'Редове на страница',
        saveEdit: 'Запазване на редактирането',
        scrollTop: 'Превъртете отгоре',
        selectAll: 'Всички избрани елементи',
        selectColor: 'Изберете цвят',
        selectLabel: 'Изберете',
        selectRow: 'Избран ред',
        showFilterMenu: 'Показване на менюто за филтриране',
        slide: 'пързалка',
        slideNumber: '{slideNumber}',
        star: '1 звезда',
        stars: '{star} звезди',
        trueLabel: 'Вярно',
        unselectAll: 'Всички елементи са премахнати',
        unselectLabel: 'Премахване на избора',
        unselectRow: 'Редът не е избран',
        zoomImage: 'Увеличете изображението',
        zoomIn: 'Увеличавам',
        zoomOut: 'Отдалечавам',
    },
};
primeLocales['bg'] = bgPrimeLocale;

/**
 * Bulgarian translations for UI labels and schema titles used in the ToolbarBG story.
 * Keyed by the English text (same key used by useText/useTranslate as fallback).
 */
export const bgTranslations = parseTranslations(`
    Add=Добавяне
    Biology=Биология
    Browse=Преглед
    Color Pattern=Цветна шарка
    Coral=Корал
    Delete=Изтриване
    Description=Описание
    Discovered=Открит
    Edit=Редактирай
    Growth Form=Форма на растеж
    Habitat=Местообитание
    Larva Type=Тип ларва
    Links=Връзки
    Morphology=Морфология
    Name=Име
    Polyp=Полип
    Reset=Отмени
    Save=Запази
    Spawn Season=Сезон на хвърляне на хайвер
    Symbiotic Algae=Симбиотични водорасли
    Taxonomy=Таксономия
    title=Заглавие
    Type=Тип
    url=Връзка
    {field} is required={field} е задължително
    {field} must be at least {minLength} characters={field} трябва да бъде поне {minLength} символа
    {field} must be at most {maxLength} characters={field} трябва да съдържа най-много {maxLength} символа
    {field} must be at least {minimum}={field} трябва да бъде поне {minimum}
    {field} must be at most {maximum}={field} трябва да бъде най-много {maximum}
    {field} has invalid format={field} има невалиден формат
`);
/* spell-checker: enable */

// Marine fixture data imported from @feasibleone/blong-marine/meta/storybook.js:
//   coralStoryValue, marineDropdownData, coralCategoryFixtures, coralFixtures
// Re-export for any story files that import them directly from this module.
export {coralCategoryFixtures, coralFixtures, coralStoryValue, marineDropdownData};

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
    // ── Coral editor entity (Editor stories: load/save/error) ─────────────────

    /** Load — resolves immediately with fixture data. */
    coralCoralGet: () => Promise.resolve(coralStoryValue),

    /** Save — echoes the submitted params back as the persisted value. */
    coralCoralSave: params => Promise.resolve(params),

    /** Save — rejects with server-side field validation errors. */
    coralCoralEditError: () => {
        const err = new Error('Server validation failed') as Error & IBlongError;
        err.print = 'server validation message';
        err.validation = [
            {field: 'coralName', message: 'Duplicate name'},
            {field: 'coralType', message: 'Invalid Type'},
        ];
        return Promise.reject(err);
    },

    /** Load — rejects with an auth error; use as `loadAction` to show session-expired dialog. */
    coralCoralGetError: () =>
        Promise.reject({
            type: 'identity.unauthenticated',
            message: 'Not authenticated',
            print: 'Your session has expired. Please log in again.',
        } satisfies IBlongError),

    /** Find — returns an empty result set (editor history tab). */
    coralCoralHistoryFind: () => Promise.resolve({items: [], total: 0}),

    // ── Coral explorer entity ─────────────────────────────────────────────────

    /** Find coral categories — returns the full category tree. */
    coralCategoryFind: () => Promise.resolve({items: coralCategoryFixtures}),

    /** Find corals — server-side filter, sort, and paging. */
    coralCoralFind: (params = {}) => {
        const {filterBy, search, orderBy, paging, ...cascadeParams} = params as {
            filterBy?: Record<string, string>;
            search?: string;
            orderBy?: Array<{field: string; dir: string}>;
            paging?: {pageSize: number; pageNumber: number};
            [key: string]: unknown;
        };
        type CoralRow = (typeof coralFixtures)[number];
        let result: CoralRow[] = [...coralFixtures];
        // Cascade params (e.g. categoryId) — exact-match filters sent by the TableWidget
        // master-detail mechanism when a parent widget (navigator) has a selection.
        for (const [field, value] of Object.entries(cascadeParams)) {
            if (value !== undefined && value !== null) {
                result = result.filter(r => (r as Record<string, unknown>)[field] === value);
            }
        }
        if (filterBy) {
            for (const [field, value] of Object.entries(filterBy)) {
                if (value) {
                    const s = String(value).toLowerCase();
                    result = result.filter(r =>
                        String((r as Record<string, unknown>)[field] ?? '')
                            .toLowerCase()
                            .includes(s),
                    );
                }
            }
        }
        if (search) {
            const s = String(search).toLowerCase();
            result = result.filter(r =>
                Object.values(r).some(v =>
                    String(v ?? '')
                        .toLowerCase()
                        .includes(s),
                ),
            );
        }
        if (orderBy?.length) {
            const {field, dir} = orderBy[0];
            result = result.slice().sort((a, b) => {
                const av = (a as Record<string, unknown>)[field];
                const bv = (b as Record<string, unknown>)[field];
                if (av === bv) return 0;
                const cmp = av == null ? -1 : bv == null ? 1 : av < bv ? -1 : 1;
                return dir === 'DESC' ? -cmp : cmp;
            });
        }
        const recordsTotal = result.length;
        if (paging?.pageSize) {
            const {pageSize, pageNumber = 1} = paging;
            result = result.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
        }
        return Promise.resolve({items: result, pagination: {recordsTotal}});
    },

    /** Find — never resolves; use as `listAction` to show loading skeleton forever. */
    coralCoralLoad: () => new Promise<never>(() => {}),

    /** Find — rejects; use as `listAction` to show session-expired error dialog. */
    coralCoralFindError: () =>
        Promise.reject({
            type: 'identity.unauthenticated',
            message: 'Not authenticated',
            print: 'Your session has expired. Please log in again.',
        } satisfies IBlongError),

    /** Add coral — success stub. */
    coralCoralAdd: params => Promise.resolve({result: 'ok', ...params}),

    /** Edit coral — success stub. */
    coralCoralEdit: params => Promise.resolve({result: 'ok', ...params}),

    /** Delete coral — success stub; fires a toast. */
    coralCoralDelete: params => Promise.resolve({result: 'ok', ...params}),

    /**
     * Submit coral — echoes resolved params back so the toast shows exactly
     * what the toolbar button prepared.  Used by the Submit story to demonstrate
     * ${id}, ${current}, ${selected} and ${current.field} template resolution.
     */
    coralCoralSubmit: params => Promise.resolve({submitted: true, params}),

    /** Submit coral error — rejects; used for the Error toolbar button in the Submit story. */
    coralCoralSubmitError: () =>
        Promise.reject({
            type: 'error.submit.failed',
            message: 'Submit failed',
            print: 'Action failed on the server.',
        } satisfies IBlongError),

    /**
     * Submit coral delayed — resolves after 1.5 s; demonstrates the successHint
     * (the "Done" overlay that appears next to the button after completion).
     */
    coralCoralSubmitDelay: params =>
        new Promise<unknown>(resolve => setTimeout(() => resolve({result: 'ok', ...params}), 1500)),

    /**
     * Open coral — triggered when a Name cell link is clicked; echoes the row
     * so the toast shows the full clicked row.
     */
    coralCoralOpen: params => Promise.resolve({opened: true, params}),

    /**
     * Handle named-dropdown requests from DropdownWidget.
     * Names ending in `Error` reject — use `dropdown: 'marine.coralTypeError'` in the
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
        return Promise.resolve(
            Object.fromEntries(names.map(n => [n, marineDropdownData[n] ?? []])),
        );
    },

    /**
     * Resolve a page component by name.
     * Called by Portal's `openByAction` and by Login's `registerPage` mechanism.
     *
     * Page names that end in 'Registration' return a simple self-registration
     * form placeholder — suitable for demonstrating the registration flow in
     * stories without a real backend.
     *
     */
    'portal.component.get': params => {
        const page = params?.page as string | undefined;
        if (
            page?.endsWith('Registration') ||
            page?.endsWith('Register') ||
            page?.endsWith('SelfRegister')
        ) {
            const SelfRegistrationPlaceholder: React.FC = () => (
                <div
                    className="blong-login__card"
                    style={{maxWidth: 400, marginTop: '2rem'}}
                >
                    <h3 style={{textAlign: 'center', marginBottom: '1rem'}}>Create Account</h3>
                    <p
                        style={{
                            color: 'var(--text-color-secondary)',
                            fontSize: '0.9rem',
                            marginBottom: '1.5rem',
                        }}
                    >
                        Registration form placeholder. Configure a <code>portal.component.get</code>{' '}
                        dispatch handler for page <em>{page}</em> to provide the real registration
                        form.
                    </p>
                    <pre
                        style={{
                            fontSize: '0.75rem',
                            background: 'var(--surface-hover)',
                            padding: '0.75rem',
                            borderRadius: '4px',
                            overflow: 'auto',
                        }}
                    >
                        {`// In your dispatch overrides:\n'portal.component.get': ({page}) => {\n  if (page === '${page}') return Promise.resolve(MyRegistrationForm);\n}`}
                    </pre>
                </div>
            );
            return Promise.resolve(SelfRegistrationPlaceholder);
        }
        return Promise.resolve(null);
    },
};

// ── Dispatch function ──────────────────────────────────────────────────────────

/**
 * Build a DispatchFn that routes calls to `defaultHandlers` merged with
 * `overrides`.  Used internally by `withDispatch`; also exported for unit tests
 * that need a standalone dispatch without a React tree.
 */
export function makeDispatch(overrides: Record<string, Handler> = {}): DispatchFn {
    const handlers = {...defaultHandlers, ...overrides};
    const result = async (method: string, params?: Record<string, unknown>) => {
        const handler = handlers[method];
        if (handler) return handler(params);
        console.info('[storybook dispatch] unhandled:', method, params);
        return undefined;
    };
    return result as DispatchFn;
}

const log = {
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.info,
};

// ── Global decorator ───────────────────────────────────────────────────────────

/**
 * withDispatch — global Storybook decorator (used in preview.tsx).
 *
 * - Registers all handler names as query actions so `useAction` uses the
 *   TanStack Query path, which exposes `loading: true` while a promise is pending.
 * - Wraps every story in `<App>` with the shared dispatch.
 *
 * Per-story decorators with overrides are only needed when behavior cannot be
 * expressed as a named action.
 */
export function withDispatch(
    overrides: Record<string, Handler> = {},
    models?: IModelSpec[],
    {
        loginRoute = '/login',
        notify = DEFAULT_NOTIFY,
        language,
        translations,
    }: {
        loginRoute?: string;
        notify?: NotifyConfig;
        language?: string;
        translations?: Record<string, string>;
    } = {},
): (Story: React.ComponentType, context?: unknown) => React.ReactElement {
    const dispatch = makeDispatch(overrides);
    // Register query (read) actions so TanStack Query can show loading state.
    // Register mutation (write) actions with mutates:true so they are NOT
    // auto-fetched by TanStack Query — only called when explicitly invoked.
    const isReadAction = (name: string) =>
        name === 'portal.dropdown.list' || /(?:Get|Load|Find|List|Fetch)(?:Error)?$/i.test(name);
    const actionEntries = Object.fromEntries(
        Object.keys({...defaultHandlers, ...overrides}).map(name => [
            name,
            isReadAction(name) ? {method: name} : {method: name, mutates: true},
        ]),
    );

    return function WithDispatch(Story, context) {
        const ctx = context as
            | {args?: Record<string, unknown>; parameters?: Record<string, unknown>}
            | undefined;
        const langArg = ctx?.args?.lang as string | undefined;
        const effectiveLang = langArg ?? language;
        /** Optional login page component passed via `story.parameters.loginComponent`. */
        const loginComponentParam = ctx?.parameters?.loginComponent as
            | React.ComponentType<{dispatch: DispatchFn}>
            | undefined;

        // Pass locale data for the active language via theme.languages so Theme registers it.
        const themeLanguages = React.useMemo(() => {
            if (effectiveLang && primeLocales[effectiveLang]) {
                return {[effectiveLang]: primeLocales[effectiveLang]};
            }
            return undefined;
        }, [effectiveLang]);

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
        // The decorator is a stable React component instance across navigation, so
        // only a Story-dependent effect re-runs on navigation.
        React.useEffect(() => {
            useAppStore.getState().clearError();
            useAppStore.getState().clearAllToasts();
            // Apply translations + PrimeReact locale for this story.
            if (effectiveLang && effectiveLang !== 'en') {
                const dict = translations ?? (effectiveLang === 'bg' ? bgTranslations : {});
                useAppStore.getState().setTranslations(dict);
                useAppStore.getState().setLanguage(effectiveLang);
            } else {
                useAppStore.getState().setTranslations({});
                useAppStore.getState().setLanguage('en');
            }
        }, [Story, effectiveLang]);

        return (
            <App
                dispatch={dispatch}
                schemaUrl="/schema.json"
                theme={{name: 'vela-blue', palette: 'dark-compact', languages: themeLanguages}}
                loginRoute={loginRoute}
                loginComponent={loginComponentParam}
                debug={true}
                log={log}
            >
                <Story />
                <Hint />
            </App>
        );
    };
}
