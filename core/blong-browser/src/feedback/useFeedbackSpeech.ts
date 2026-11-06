/**
 * useFeedbackSpeech.ts — which callout is being dictated into (`@@D-758`).
 *
 * One microphone per page, so the state that says "this box is listening" cannot
 * live in the box: it lives in this module, outside React, and every callout
 * subscribes to it. A `useSyncExternalStore` subscription rather than a store
 * slice, because the session is an engine handle with a lifetime of its own — it
 * outlives the render that started it and must survive a hot reload of the tree.
 *
 * Starting is deliberately asynchronous: the sherpa engine downloads a model, so
 * a start that is overtaken by a stop (the person switched the box off, or the
 * mode closed) checks a generation counter before it claims the microphone.
 *
 * Two things here are the person's rather than the engine's. The language is the
 * portal's, because that is what they read the page in (`D-761`). And the phrase
 * still being recognised can be taken into the comment or dismissed before it
 * finishes (`D-764`) — which is why this module, and not the engine, remembers
 * which words of the phrase are already spoken for.
 */

import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { useAppStore } from '../state/appStore.js';
import type { IFeedbackSpeechConfig } from '../types/portal.js';

import {
    appendSpeech,
    createSpeechEngine,
    microphonePermission,
    punctuateSpeech,
    remainingSpeech,
    resolveSpeechLanguage,
    setSpeechPreferences,
    speechPreferences,
    subscribeSpeechPreferences,
    type ISpeechEngine,
    type ISpeechPreferences,
    type SpeechLevel,
} from './speech.js';

/** Why dictation is not running, when it is not (`@@D-758`). */
export type SpeechError = 'unsupported' | 'denied' | 'failed';

/** What every callout reads. */
export interface ISpeechSnapshot {
    /** The box being dictated into, or `null` when nothing is listening. */
    listeningTargetId: string | null;
    /** The phrase the engine is still recognising, drawn as a caption. */
    interimText: string;
    /** What is in the microphone: a voice, some other sound, or a room (`D-774`). */
    level: SpeechLevel;
    /** The wait being counted down, in milliseconds (`D-775`). */
    waitMs: number;
    /** How many times the wait has started again, so a bar can start again with it. */
    idle: number;
    /** Set when the last attempt failed; cleared by the next one. */
    error?: SpeechError;
}

const IDLE: ISpeechSnapshot = {
    listeningTargetId: null,
    interimText: '',
    level: 'silence',
    waitMs: 0,
    idle: 0,
};

let engine: ISpeechEngine | undefined;
/** Bumped by every start and stop, so a start that finishes late can bow out. */
let generation = 0;
/**
 * The words of the phrase under way already taken into the comment, or dismissed
 * (`D-764`). Cleared by every start and stop, because a phrase does not survive a
 * session.
 */
let handled = '';
/**
 * The session as the caller asked for it, so a switch that changes how recognition
 * runs can be applied to a box that is already listening (`D-767`).
 *
 * The configuration is kept **unresolved**: the language and the on-device flag are
 * read when an engine starts, and a restart exists precisely so the new values are
 * read.
 */
let session: {targetId: string; config: IFeedbackSpeechConfig; options: ISpeechOptions} | undefined;
let snapshot: ISpeechSnapshot = IDLE;
const listeners = new Set<() => void>();

function publish(next: ISpeechSnapshot): void {
    snapshot = next;
    for (const listener of listeners) listener();
}

/** The current state, for `useSyncExternalStore`. */
export function speechSnapshot(): ISpeechSnapshot {
    return snapshot;
}

/** Subscribe to changes; the returned function unsubscribes. */
export function speechSubscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/**
 * Write the phrase under way into the comment, so closing a session does not throw
 * away the words that were already recognised (`D-771`).
 *
 * A pause is the most common way a phrase ends, and a person who has just spoken a
 * sentence expects it in the box, not back in the microphone. What was heard is
 * taken as it stands — no punctuation, because it is a phrase the engine had not
 * finished — and only the part not already taken or dropped is written.
 */
function flushInterim(): void {
    const text = snapshot.interimText.trim();
    const current = session;
    const deliver = current?.options.onText;
    if (!text || !current || !deliver) return;
    handled = '';
    deliver(current.targetId, text);
}

/** Close the microphone and forget which box was listening. */
export function speechStop(): void {
    // Before the session is forgotten: what the engine had already recognised is
    // the person's words, and a stop is not a reason to lose them (`D-771`).
    flushInterim();
    generation += 1;
    engine?.stop();
    engine = undefined;
    handled = '';
    session = undefined;
    if (snapshot !== IDLE) publish(IDLE);
}

/**
 * Take the phrase still being recognised into the comment (`D-764`).
 *
 * Returns the words taken, so the caller appends exactly what was accepted rather
 * than reading the snapshot again; `undefined` when there was nothing to take. The
 * words are remembered and cut off whatever the engine reports next, so the phrase
 * is never written twice.
 */
export function speechTakeInterim(): string | undefined {
    const text = snapshot.interimText.trim();
    if (!text) return undefined;
    handled = appendSpeech(handled, text);
    publish({...snapshot, interimText: ''});
    return text;
}

/**
 * Forget the phrase still being recognised without writing it (`D-764`).
 *
 * The words are dropped rather than undone: an engine that reports them again
 * while they are still being refined finds them already accounted for, and the
 * part it finishes with is what reaches the comment.
 */
export function speechDropInterim(): void {
    const text = snapshot.interimText.trim();
    if (!text) return;
    handled = appendSpeech(handled, text);
    publish({...snapshot, interimText: ''});
}

/** What a start needs from the caller. */
export interface ISpeechOptions {
    /** Only start when the microphone is already granted (`@@D-758`). */
    auto?: boolean;
    /** The portal's language, which is what the person reads and therefore speaks. */
    language?: string;
    /** Where a finished phrase goes. */
    onText?: (targetId: string, transcript: string) => void;
}

/**
 * Start dictating into one box.
 *
 * `auto` is the path a click on a target or a focus in a callout takes, and it
 * refuses to run unless the microphone is already granted: a prompt raised by
 * clicking a card would ambush the person, and a prompt they dismiss poisons the
 * origin for the rest of the session (`@@D-758`).
 */
export async function speechListen(
    targetId: string,
    config: IFeedbackSpeechConfig | undefined,
    options: ISpeechOptions = {},
): Promise<boolean> {
    if (snapshot.listeningTargetId === targetId) return true;
    // No block, no microphone. `speechSupported` answers for the browser, not for
    // the deployment, so the two must both say yes before anything is opened.
    if (!config) return false;
    if (options.auto) {
        if (config.autoListen === false) return false;
        if ((await microphonePermission()) !== 'granted') return false;
    }

    speechStop();
    const mine = generation;

    let opened: ISpeechEngine | undefined;
    try {
        opened = await createSpeechEngine({
            ...config,
            language: resolveSpeechLanguage(options.language, config.language),
        });
    } catch {
        if (mine === generation) publish({...IDLE, error: 'failed'});
        return false;
    }
    if (!opened) {
        publish({...IDLE, error: 'unsupported'});
        return false;
    }
    // A stop landed while the engine was loading; the microphone is not ours.
    if (mine !== generation) return false;

    engine = opened;
    handled = '';
    let ended = false;
    publish({listeningTargetId: targetId, interimText: '', level: 'silence', waitMs: 0, idle: 0});

    /** The session is over without the person asking: say why, and stop showing it as on. */
    const gaveUp = (reason?: string) => {
        if (mine !== generation) return;
        ended = true;
        engine = undefined;
        // A pause is the person having finished, not the browser refusing: the
        // box closes with no error and keeps the words it had already recognised
        // (`D-765` `D-771`). Both happen before the session is forgotten, because
        // the phrase has nowhere to go once it is.
        if (reason === 'silence') flushInterim();
        handled = '';
        session = undefined;
        if (reason === 'silence') {
            publish(IDLE);
            return;
        }
        const refused =
            reason === 'not-allowed' ||
            reason === 'service-not-allowed' ||
            reason === 'NotAllowedError';
        publish({...IDLE, error: refused ? 'denied' : 'failed'});
    };

    try {
        await opened.start(phrase => {
            // `mine !== generation` covers a stop; the engine reports what it heard
            // just before it was closed, and `ended` covers the session that ended
            // on its own (`D-766`).
            if (mine !== generation || ended) return;
            if (phrase.final) {
                const continues = handled !== '';
                const rest = remainingSpeech(phrase.final, handled);
                handled = '';
                publish({
                    ...snapshot,
                    listeningTargetId: targetId,
                    interimText: '',
                });
                if (rest) {
                    // A phrase a person already took part of is mid-sentence by
                    // definition, so it is not given a capital or a full stop
                    // (`D-764`).
                    const punctuate = !continues && speechPreferences().punctuation;
                    options.onText?.(targetId, punctuate ? punctuateSpeech(rest) : rest);
                }
                return;
            }
            publish({
                ...snapshot,
                listeningTargetId: targetId,
                interimText: remainingSpeech(phrase.interim, handled),
            });
        }, gaveUp, activity => {
            // What the microphone is picking up, and how long the engine will wait
            // before it closes — reported by the engine because only it knows which
            // tier its clock is in (`D-774` `D-775`).
            if (mine !== generation || ended) return;
            publish({...snapshot, ...activity});
        });
        if (mine !== generation) return false;
        session = {targetId, config, options};
        return true;
    } catch (error) {
        gaveUp((error as {name?: string} | undefined)?.name);
        return false;
    }
}

/** Switch one box's dictation on or off. */
export async function speechToggle(
    targetId: string,
    config: IFeedbackSpeechConfig | undefined,
    options: ISpeechOptions = {},
): Promise<boolean> {
    if (snapshot.listeningTargetId === targetId) {
        speechStop();
        return false;
    }
    return speechListen(targetId, config, options);
}

/**
 * Start the listening box again with the switches as they now stand (`D-767`).
 *
 * A recogniser reads its language and its on-device flag when it starts, so a pill
 * pressed mid-session would otherwise change nothing until the box was closed and
 * opened by hand — and the silence clock would go on running through the seconds
 * spent pressing it, closing the microphone the person was about to speak into.
 * Restarting re-reads both and gives the box a fresh pause budget.
 */
export async function speechRestart(): Promise<boolean> {
    const current = session;
    if (!current) return false;
    speechStop();
    // Never `auto`: the microphone is open already, or this session would not
    // exist, and re-asking the permission question would refuse the restart on a
    // browser that does not answer it (`D-767`).
    return speechListen(current.targetId, current.config, {...current.options, auto: false});
}

/** The dictation state, bound to React (`@@D-758`). */
export interface IFeedbackSpeech extends ISpeechSnapshot {
    start: (
        targetId: string,
        config: IFeedbackSpeechConfig | undefined,
        options?: {auto?: boolean},
    ) => Promise<boolean>;
    toggle: (targetId: string, config: IFeedbackSpeechConfig | undefined) => Promise<boolean>;
    stop: () => void;
    /** Take the phrase under way into the comment (`D-764`); `undefined` when none. */
    acceptInterim: () => string | undefined;
    /** Dismiss the phrase under way without writing it (`D-764`). */
    clearInterim: () => void;
}

/**
 * Subscribe a component to the session, and give it the commands.
 *
 * `onText` is the one thing the caller supplies: a finished phrase has to reach
 * the draft, and this module knows nothing about the draft. The language is read
 * from the store rather than passed in, because every caller would pass the same
 * one — and a portal that switches language mid-session must dictate in the new
 * one (`D-761`).
 */
export function useFeedbackSpeech(
    onText: (targetId: string, transcript: string) => void,
): IFeedbackSpeech {
    const state = useSyncExternalStore(speechSubscribe, speechSnapshot, speechSnapshot);
    const language = useAppStore(store => store.language);
    const onTextRef = useRef(onText);
    onTextRef.current = onText;

    const deliver = useCallback(
        (targetId: string, transcript: string) => onTextRef.current(targetId, transcript),
        [],
    );
    const start = useCallback(
        (targetId: string, config: IFeedbackSpeechConfig | undefined, options?: {auto?: boolean}) =>
            speechListen(targetId, config, {...options, language, onText: deliver}),
        [deliver, language],
    );
    const toggle = useCallback(
        (targetId: string, config: IFeedbackSpeechConfig | undefined) =>
            speechToggle(targetId, config, {language, onText: deliver}),
        [deliver, language],
    );

    return useMemo(
        () => ({
            ...state,
            start,
            toggle,
            stop: speechStop,
            acceptInterim: speechTakeInterim,
            clearInterim: speechDropInterim,
        }),
        [state, start, toggle],
    );
}

/**
 * The dictation switches, and the command that changes them (`D-763`).
 *
 * Bound to the same module-level store as the session, so the pill a person
 * presses changes what the next phrase does — and every callout shows the new
 * state — without any of it surviving a reload. A switch pressed while a box is
 * listening restarts that box, because a recogniser reads its language and its
 * on-device flag only when it starts (`D-767`).
 */
export function useSpeechPreferences(): {
    preferences: ISpeechPreferences;
    setPreference: (patch: Partial<ISpeechPreferences>) => void;
} {
    const preferences = useSyncExternalStore(
        subscribeSpeechPreferences,
        speechPreferences,
        speechPreferences,
    );
    const setPreference = useCallback((patch: Partial<ISpeechPreferences>) => {
        const before = speechPreferences();
        setSpeechPreferences(patch);
        // The store keeps its identity when nothing changed, so a pill clicked
        // twice does not restart a session for a setting that did not move.
        if (speechPreferences() === before) return;
        void speechRestart();
    }, []);
    return useMemo(() => ({preferences, setPreference}), [preferences, setPreference]);
}
