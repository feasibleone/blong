/**
 * Portal type definitions.
 * Portal manages tabs, navigation, and menu configuration.
 */

import type {IAction} from '@feasibleone/blong';
import type {TranslationDict} from '../state/appStore.js';

/** A single open tab in the portal */
export interface ITab {
    id: string;
    /** The action that opened this tab */
    /** The action name that opened this tab */
    actionName: string;
    /** Parameters that were passed to the action */
    params?: Record<string, unknown>;
    /** Resolved display title */
    title: string;
    /** Whether the tab has unsaved changes */
    dirty?: boolean;
    /** The loaded React component (after phase 2 resolution) */
    component?: React.ComponentType;
}
/** Menu item — can be a group or a leaf */
export type IMenuItem =
    | IAction
    | {
          /**
           * Stable, language-independent id for the group. Defaults to the first
           * child method's subject; set it when that would collide with another
           * group (the `Test` group's first child is an `access.*` method).
           */
          id?: string;
          title: string;
          permission?: string;
          icon?: string;
          items: IMenuItem[];
      };

/**
 * The suite's brand, as the shell draws it.
 *
 * Every field is optional and every one is a value rather than an import: a
 * suite names its logo in configuration (`ui.portal.portal.brand` in its
 * `browser.ts`) and `blong-browser` ships no asset of its own, so a deployment
 * that turns the block off looks exactly as it did before branding existed
 * (`@@D-734`).
 *
 * Two sizes are drawn from one logo. The toolbar takes `logoUrl` at the height
 * of the menubar's own content — the bar keeps its height, which is what makes
 * a logo safe to add there — and the portal's empty state (no tab open) draws
 * the same file large, centred in the whitespace, beside `title` and the
 * organisation. Pass `logoIcon` instead when the mark is a PrimeIcons glyph.
 */
export interface IPortalBrand {
    /** Product logo — an image URL, drawn in the menubar and in the empty state. */
    logoUrl?: string;
    /**
     * The menubar's mark, when the logo is not a mark.
     *
     * The bar is 28px tall, so a portrait lockup — a crest above a wordmark, an
     * emblem the title sits under — is 16px wide there and reads as a smudge.
     * Naming the emblem on its own keeps the full logo for the places that have
     * the room and puts the part that still reads in the toolbar. Falls back to
     * `logoUrl`.
     */
    markUrl?: string;
    /**
     * The menubar mark's height, as a CSS length (`2rem`).
     *
     * The bar's height is its content's, so this is also how tall the bar is:
     * the default (`--blong-portal-brand-height`, 1.75rem) is what a mark that
     * speaks for itself needs, and a suite that wants a bigger one says so.
     */
    markHeight?: string;
    /**
     * The logo's height in the portal's empty state, as a CSS length (`24rem`).
     *
     * The default 8rem suits a square mark. A portrait lockup — a crest above a
     * wordmark — is only a third as wide at the same height, so it reads small
     * in the whitespace and the suite is the only one that knows how much room
     * its own logo wants. Setting this also lifts the 40vh cap the default
     * carries, because a suite that names a height has done the arithmetic.
     */
    logoHeight?: string;
    /** PrimeIcons class used when `logoUrl` is absent (`pi pi-bolt`). */
    logoIcon?: string;
    /** Organisation line under the title in the portal's empty state. */
    orgTitle?: string;
    /** Organisation logo, drawn small beside `orgTitle`. */
    orgLogoUrl?: string;
    /** PrimeIcons class used when `orgLogoUrl` is absent. */
    orgIcon?: string;
}

/** Portal configuration YAML shape */
export interface IPortalConfig {
    name: string;
    title: string;
    theme?: string;
    home?: IAction;
    menu?: IMenuItem[];
    /**
     * How the model-generated groups and the configured `menu` combine.
     *
     * `merge` (default) adds the configured groups to the generated ones; `replace`
     * drops the generated ones, so `menu` is the whole menubar. Read by the model
     * aggregator before it answers `portalConfigGet` — the switch a realm with a
     * hand-written menu sets instead of hiding every model (`@@D-777`).
     */
    menuMode?: 'merge' | 'replace';
    rightMenu?: IMenuItem[];
    /** The suite's brand: logo and organisation beside the title (`@@D-734`). */
    brand?: IPortalBrand;
    /**
     * Self-service account profile wiring for the top-right account menu.
     * `page` is the component method that returns the profile page (e.g.
     * 'access.user.profile'), `get` the server method returning the caller's
     * own profile for the avatar (e.g. 'access.profile.get').
     */
    profile?: {
        page?: string;
        get?: string;
    };
    /**
     * Per-language translation dictionaries (English key → translated string).
     * Registered by the app so `setLanguage(language)` swaps the active table
     * to the matching language's dictionary.
     */
    translations?: Record<string, TranslationDict>;
    /**
     * UI languages offered by the menubar language switcher (ad-hoc switching).
     * Each entry is `{value, label}` where `value` matches a translation-
     * dictionary key.  When omitted, the switcher derives the list from the
     * keys of `translations` (and hides when fewer than two are available).
     */
    languages?: Array<{value: string; label: string}>;
    /**
     * The database half of the dictionary, and the collector switch.
     *
     * `load.label` and `load.resource` name the handlers that answer
     * `{languageCode}` with a dictionary (`core.label.list` and
     * `core.translation.list` in a suite that attaches blong-core). Naming them
     * in configuration keeps blong-browser free of a dependency on core, and a
     * suite may point them elsewhere (`D-630`). `collect` turns the
     * rendered-string collector on for a dev or test portal.
     */
    translation?: {
        load?: {label?: string; resource?: string};
        collect?: boolean;
    };
    /**
     * Feedback mode (`@@T-467`, `@@D-662`).
     *
     * Every method name is configuration rather than an import, exactly as
     * `translation.load` names the dictionary readers: `blong-browser` ships the
     * mode, the realm that stores the reports is named here. A suite that omits
     * the block gets no toggle — deliberate, because the switch adds a node to the
     * menubar and would otherwise invalidate every visual baseline of every suite
     * that never turned the feature on.
     */
    feedback?: IPortalFeedbackConfig;
}

/** How the feedback mode is wired into a portal (`@@T-467`). */
export interface IPortalFeedbackConfig {
    /** The switch renders only when this is true. */
    enabled?: boolean;
    /** Keyboard shortcut that toggles the mode; default `F2` (`@@T-491`). */
    shortcut?: string;
    /** Method that stores one submission; default `feedback.session.add`. */
    submit?: string;
    /** Permission the switch and the submit bar check; default `feedback.session.add`. */
    permission?: string;
    /** Method that lists sessions for the review page. */
    find?: string;
    /** Method that reads one session with its items. */
    get?: string;
    /** Method that returns one session's screenshot. */
    shot?: string;
    /** Method that renders the Markdown for a batch. */
    prose?: string;
    /** Method that marks a batch processed. */
    update?: string;
    /** Byte ceiling for the captured data URL; default 700 000. */
    maxShotBytes?: number;
    /**
     * Dictation inside a callout (`D-758`).
     *
     * Absent means no microphone: the callout shows no mic button and a new box
     * never starts listening on its own. Naming an engine here is what a suite
     * does when its people dictate their comments instead of typing them.
     */
    speech?: IFeedbackSpeechConfig;
}

/** The engines the mode can dictate through (`D-758`). */
export type FeedbackSpeechEngine = 'webSpeech' | 'sherpa';

/** The files of a streaming Zipformer model, as URLs (`D-758`). */
export interface ISherpaSpeechConfig {
    /**
     * The module that exports `createOnlineRecognizer`; default
     * `sherpa-onnx`.
     *
     * It is configuration rather than an import because the package is optional:
     * `blong-browser` must install, type-check and run without it, and the
     * deployment decides whether a 73 MB model is worth its bandwidth.
     *
     * A **URL** works too, and a browser needs one: the npm package is the Node
     * build (it reads model files through `fs` and refuses to start outside
     * Node). `blong-browser` ships an adapter for a browser WASM build at
     * `public/speech/sherpawAdapter.js`, which the Storybook serves — see the
     * `Components/Feedback/Sherpa` story (`T-612`).
     */
    module?: string;
    /** Encoder of the transducer, usually the int8 quantisation. */
    encoder: string;
    decoder: string;
    joiner: string;
    tokens: string;
    /** Decoding threads; default 1, which is what a browser main thread wants. */
    numThreads?: number;
}

/** What a suite declares under `portal.feedback.speech` (`D-758`). */
interface ISpeechCommon {
    /**
     * BCP-47 tag the engine is handed, as a **fallback** only (`D-761`).
     *
     * Dictation is in the language the portal is being read in, because a person
     * describes a page in the language it is written in; this field answers for a
     * page that has no language of its own, and the English switch on the callout
     * overrides both.
     */
    language?: string;
    /** Listen when a callout is created or focused; default true. */
    autoListen?: boolean;
}

/** Dictation through the browser's own recogniser, which needs no download. */
export interface IWebSpeechConfig extends ISpeechCommon {
    engine?: 'webSpeech';
}

/** Dictation through a model that runs in the page, so no audio leaves it. */
export interface ISherpaSpeechConfigEntry extends ISpeechCommon {
    engine: 'sherpa';
    sherpa: ISherpaSpeechConfig;
}

/**
 * The dictation block.
 *
 * A union rather than one interface with an optional `sherpa`: the sherpa engine
 * cannot run without its four model URLs, and the type is the first place that
 * says so.
 */
export type IFeedbackSpeechConfig = IWebSpeechConfig | ISherpaSpeechConfigEntry;

/** Portal tab state managed by Zustand */
export interface IPortalState {
    tabs: ITab[];
    activeTabId: string | null;
    portalConfig: IPortalConfig | null;
}

/** Navigator node for hierarchical navigation */
export interface INavigatorNode {
    [key: string]: unknown;
    children?: INavigatorNode[];
}
