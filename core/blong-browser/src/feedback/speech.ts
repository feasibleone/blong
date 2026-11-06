/**
 * speech.ts — dictation for the feedback mode (`@@D-758`).
 *
 * Two engines behind one contract, so the callout never learns which one is
 * listening. `webSpeech` wraps the browser's own recogniser: nothing to download,
 * and in Chrome the audio goes to a cloud service. `sherpa` runs a streaming
 * Zipformer model in the page through WebAssembly, which is what a suite that
 * must not send audio anywhere selects.
 *
 * sherpa is loaded by an optional dynamic import, exactly as
 * `core/semantic-log` loads `@huggingface/transformers`: `blong-browser` has to
 * install, type-check and run with the package absent, so the module name and the
 * four model URLs are configuration and the loader is injectable for a test.
 *
 * Three switches belong to the person rather than the deployment — on-device
 * recognition, written punctuation, and English over the portal's language — and
 * they live here beside the engines, outside React, until the page is reloaded
 * (`D-763`).
 *
 * Nothing here touches React. The store that says which box is listening lives in
 * `useFeedbackSpeech.ts`; this module only turns audio into text.
 */

import type {IFeedbackSpeechConfig, ISherpaSpeechConfig} from '../types/portal.js';

// ── The contract ───────────────────────────────────────────────────────────

/** What one engine has heard (`@@D-758`). */
export interface ISpeechPhrase {
    /** The phrase still being recognised; it is replaced as the engine refines it. */
    interim: string;
    /** A phrase the engine considers finished; empty when none finished. */
    final: string;
}

/**
 * What the microphone has at the moment (`D-774`).
 *
 * Three states rather than two, because a room is rarely silent: a chair creak or
 * a fan is a sound and not a voice, and an indicator that says "hearing" for both
 * teaches a person to ignore it.
 */
export type SpeechLevel = 'silence' | 'sound' | 'speech';

/**
 * What an engine says about the microphone and the wait it is counting down
 * (`D-774` `D-775`).
 *
 * The wait is reported rather than assumed because only the engine knows which
 * tier it is in, and the bar that shows it must not lie about how long is left.
 */
export interface ISpeechActivity {
    /** What is in the microphone now. */
    level: SpeechLevel;
    /** The wait being counted down at this moment, in milliseconds. */
    waitMs: number;
    /** How many times the wait has started again in this session. */
    idle: number;
}

/** One engine that can turn speech into text. */
export interface ISpeechEngine {
    /**
     * Open the microphone and report what is heard.
     *
     * Rejects when the microphone cannot be opened at all — no permission, no
     * device, or a model that failed to load — so the caller can say so once
     * instead of leaving a dead button. A session that opens and then gives up
     * reports it through `onEnd`, which is what keeps the switch from reading as
     * listening when nothing is.
     */
    start(
        onPhrase: (phrase: ISpeechPhrase) => void,
        onEnd?: (reason?: string) => void,
        /**
         * What the microphone has and how long it will wait (`D-774` `D-775`).
         *
         * An engine reports it when it changes rather than per frame, so a callout
         * can draw the room it is in and the time it has left while the words are
         * still on their way.
         */
        onActivity?: (activity: ISpeechActivity) => void,
    ): Promise<void>;
    /** Close the microphone; safe to call when nothing is open. */
    stop(): void;
}

// ── The switches a person sets while dictating ─────────────────────────────

/**
 * How dictation behaves in this page (`D-763`).
 *
 * All three are the person's, not the suite's: whether recognition runs on the
 * device, whether the text comes back punctuated, and whether English is forced
 * over the portal's own language. They sit outside React beside the session, so
 * a box can be closed and reopened without losing them, and they are not
 * persisted on purpose — a reload is how a person gets the defaults back.
 */
export interface ISpeechPreferences {
    /** Recognise on the device where the browser can, instead of a cloud service. */
    onDevice: boolean;
    /** Write the punctuation a speaker did not say. */
    punctuation: boolean;
    /** Dictate in English whatever language the portal is in. */
    english: boolean;
}

/**
 * The switches before anyone touches them: punctuated, the portal's language, and
 * recognition on the device when the browser offers it.
 *
 * On-device is the default again (`D-769`): the silence that looked like a deaf
 * model was the pause clock counting the service's warm-up, not the model failing
 * (`D-772`). The fallback stays, because a model really can be deaf.
 */
export const SPEECH_PREFERENCES_DEFAULT: ISpeechPreferences = {
    onDevice: true,
    punctuation: true,
    english: false,
};

/** The one language the English switch dictates in. */
const ENGLISH_LANGUAGE = 'en-US';

let preferences: ISpeechPreferences = {...SPEECH_PREFERENCES_DEFAULT};
const preferenceListeners = new Set<() => void>();

/** The switches as they stand, for `useSyncExternalStore`. */
export function speechPreferences(): ISpeechPreferences {
    return preferences;
}

/** Hear about a switch changing; the returned function unsubscribes. */
export function subscribeSpeechPreferences(listener: () => void): () => void {
    preferenceListeners.add(listener);
    return () => {
        preferenceListeners.delete(listener);
    };
}

/** Change the switches; anything not named keeps its value (`D-763`). */
export function setSpeechPreferences(patch: Partial<ISpeechPreferences>): void {
    const next = {...preferences, ...patch};
    if (
        next.onDevice === preferences.onDevice &&
        next.punctuation === preferences.punctuation &&
        next.english === preferences.english
    ) {
        return;
    }
    preferences = next;
    for (const listener of preferenceListeners) listener();
}

/** Put the switches back where they started — a test's cleanup, not a person's. */
export function resetSpeechPreferences(): void {
    setSpeechPreferences(SPEECH_PREFERENCES_DEFAULT);
}

// ── The Web Speech API, structurally ───────────────────────────────────────

/**
 * The slice of the Web Speech API this module uses, written out because the DOM
 * library ships no declarations for it — the API is still `webkit`-prefixed in
 * the browsers that have it.
 */
interface ISpeechAlternative {
    readonly transcript: string;
}

interface ISpeechResult {
    readonly isFinal: boolean;
    readonly length: number;
    readonly [index: number]: ISpeechAlternative;
}

export interface ISpeechResultEvent {
    readonly resultIndex: number;
    readonly results: ArrayLike<ISpeechResult>;
}

export interface ISpeechErrorEvent {
    readonly error: string;
}

export interface ISpeechRecognition {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    /**
     * Recognise on this device rather than through the browser's service
     * (`D-763`).
     *
     * Chrome exposes it on the recogniser; a browser that has no on-device model
     * leaves the property off entirely, which is what the mode reads as "the
     * switch has nothing to do here".
     */
    processLocally?: boolean;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((event: ISpeechResultEvent) => void) | null;
    onerror: ((event: ISpeechErrorEvent) => void) | null;
    onend: (() => void) | null;
    /**
     * Fired when the recogniser decides it is hearing a voice, before it can
     * transcribe any of it (`D-772` `D-774`).
     *
     * It is the only signal a session gets while recognition is still working on
     * the first phrase, so the pause clock listens to it and the callout shows the
     * voice with it: without it a slow service would be cut off in the middle of a
     * sentence, and the person would have nothing to look at while they wait. A
     * browser that does not fire it leaves the clock on results alone.
     */
    onspeechstart?: ((event: Event) => void) | null;
    onspeechend?: ((event: Event) => void) | null;
    /**
     * Fired for any sound above the room, whether or not it is a voice (`D-774`).
     *
     * It arrives earlier than `speechstart`, which is why the indicator listens to
     * it: "there is something in the microphone" and "that something is a voice"
     * are different answers, and only the second one deserves a pulse.
     */
    onsoundstart?: ((event: Event) => void) | null;
    onsoundend?: ((event: Event) => void) | null;
}

export interface ISpeechRecognitionConstructor {
    new (): ISpeechRecognition;
    /**
     * What the browser can do with a language, which is how the mode knows
     * whether on-device recognition is possible at all (`D-763`).
     *
     * It answers `available`, `downloadable`, `downloading` or `unavailable`, and
     * a browser that does not implement it says nothing rather than no.
     */
    available?: (options: {langs: string[]; processLocally?: boolean}) => Promise<string>;
}

/** The recogniser the browser exposes, under either of its two names. */
export function speechRecognitionConstructor(): ISpeechRecognitionConstructor | undefined {
    const scope = globalThis as {
        SpeechRecognition?: ISpeechRecognitionConstructor;
        webkitSpeechRecognition?: ISpeechRecognitionConstructor;
    };
    return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

/**
 * Can this recogniser run on the device rather than through a service (`D-763`)?
 *
 * `available` is the newer of the two answers and the more reliable one; the
 * property check covers a browser that shipped on-device recognition before it
 * shipped the question. Both are read off the constructor rather than a
 * constructed recogniser: a caller is a button deciding whether to render, and
 * building one to ask would cost a recogniser per callout.
 */
export function localRecognitionAvailable(
    Constructor: ISpeechRecognitionConstructor | undefined = speechRecognitionConstructor(),
): boolean {
    if (!Constructor) return false;
    if (typeof Constructor.available === 'function') return true;
    const prototype = Constructor.prototype as {processLocally?: unknown} | undefined;
    return Boolean(prototype && 'processLocally' in prototype);
}

/** What the browser says about on-device recognition for a language, if it says anything. */
async function localAvailability(
    Constructor: ISpeechRecognitionConstructor,
    language: string,
): Promise<string | undefined> {
    if (typeof Constructor.available !== 'function') return undefined;
    try {
        return await Constructor.available({langs: [language], processLocally: true});
    } catch {
        return undefined;
    }
}

/**
 * How long a session keeps the microphone open after the last thing it heard
 * (`D-765`).
 *
 * Eight seconds rather than four (`D-775`): the pause and the engine's own
 * finalisation of a phrase are close together, and four seconds often closed the
 * box on a phrase that was about to be finalised — which then arrived as the
 * unfinished interim instead.
 */
export const SPEECH_SILENCE_MS = 8000;

/**
 * How long a session waits for the first sign of a voice before closing itself
 * (`D-772`).
 *
 * Recognition takes a while to become live — the service has to be reached, or a
 * model loaded, and the first session of a page is the slowest — so this is not a
 * pause and must not be measured as one. It is a ceiling on a session where
 * nothing happens at all, which is what keeps a dead microphone from reading as
 * listening forever.
 */
export const SPEECH_START_GRACE_MS = 15_000;

/**
 * How long a session that has heard a voice waits for the first word of it
 * (`D-772`).
 *
 * Between a voice and its first transcription the recogniser is still working; the
 * four-second pause belongs to a recogniser that is answering, so it only starts
 * measuring once something has been transcribed.
 */
export const SPEECH_FIRST_RESULT_MS = 10_000;

/**
 * One recogniser, restarted when the browser ends it.
 *
 * `continuous` does not mean "until stopped": Chrome ends recognition after a few
 * seconds of silence and fires `onend`, so a restart is what keeps a box listening
 * while its person thinks. Every error but `no-speech` latches the engine shut:
 * `no-speech` is a quiet microphone and is normal, while a refusal or an
 * unreachable recognition service would be raised again by every restart, in a
 * loop that spins for as long as the box is open.
 *
 * The pause is tiered (`D-772`): a session that has produced a transcription has
 * eight seconds of silence between phrases, one that has heard a voice but no
 * words has ten, and one that has heard nothing at all has fifteen. Recognition is
 * not instant, and the first use of a page is the slowest; a flat four seconds
 * closed the microphone in the middle of a sentence the recogniser was still
 * working on.
 *
 * On-device recognition is asked for when the person left the switch on and this
 * browser has a model for the language. A language the device cannot do — or would
 * have to download a model for — falls back to the service rather than failing:
 * setting the flag alone makes the recogniser refuse to start at all.
 */
export function createWebSpeechEngine(
    language: string,
    Constructor: ISpeechRecognitionConstructor | undefined = speechRecognitionConstructor(),
    options: {silenceMs?: number; startGraceMs?: number; firstResultMs?: number} = {},
): ISpeechEngine | undefined {
    if (!Constructor) return undefined;
    const silenceMs = options.silenceMs ?? SPEECH_SILENCE_MS;
    const startGraceMs = options.startGraceMs ?? SPEECH_START_GRACE_MS;
    const firstResultMs = options.firstResultMs ?? SPEECH_FIRST_RESULT_MS;
    let recognition: ISpeechRecognition | undefined;
    let closed = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    const disarm = () => {
        if (idleTimer !== undefined) clearTimeout(idleTimer);
        idleTimer = undefined;
    };

    return {
        async start(onPhrase, onEnd, onActivity) {
            closed = false;
            const instance = new Constructor();
            recognition = instance;
            /** Anything transcribed, which is what tells a working model from a deaf one. */
            let heard = false;
            /** The recogniser said it was hearing a voice (`D-772`). */
            let spoke = false;
            /** The service has already been tried in place of the device (`D-769`). */
            let fellBack = false;
            /** What is in the microphone, as last reported (`D-774`). */
            let level: SpeechLevel = 'silence';
            let levelTimer: ReturnType<typeof setTimeout> | undefined;
            /** How many waits this session has counted down (`D-775`). */
            let idle = 0;

            /** The wait the session allows itself from here (`D-772`). */
            const wait = () => (heard ? silenceMs : spoke ? firstResultMs : startGraceMs);
            const report = () => onActivity?.({level, waitMs: wait(), idle});
            const setLevel = (next: SpeechLevel) => {
                if (next === level) return;
                level = next;
                report();
            };
            /**
             * Say what is in the room, and forget it again unless it is said again.
             *
             * The hold is what stops the dot blinking: a recogniser fires its speech
             * events in bursts, and an indicator that followed them one for one
             * flickered through the gaps that are not silence (`D-774`). Two seconds
             * is long enough to cover a phrase being worked on and short enough that
             * a real pause dims the dot when the pause is real.
             */
            const hold = (next: SpeechLevel, ms = 2000) => {
                setLevel(next);
                if (levelTimer !== undefined) clearTimeout(levelTimer);
                levelTimer = setTimeout(() => {
                    levelTimer = undefined;
                    if (!closed) setLevel('silence');
                }, ms);
            };
            // A session ends for a reason the switch has to hear about: the
            // microphone was refused, the service is unreachable, or a restart
            // was not allowed. `stop()` closes silently, because the person
            // already knows they switched it off.
            const fail = (reason: string) => {
                if (closed) return;
                closed = true;
                disarm();
                if (levelTimer !== undefined) clearTimeout(levelTimer);
                level = 'silence';
                report();
                onEnd?.(reason);
            };
            // Going quiet is not a failure: it closes the session the way the
            // switch does, so the box stops reading as listening with no error.
            const expire = () => {
                if (closed) return;
                disarm();
                // A voice was heard and not one word came back while the device was
                // doing the recognising. That is what a model Chrome reports as
                // available does when it is not actually there: it holds the
                // microphone open and transcribes nothing. The service is tried
                // instead, and the switch goes off so the next box does not start
                // the same way (`D-769`).
                if (!heard && spoke && instance.processLocally && !fellBack) {
                    fellBack = true;
                    instance.processLocally = false;
                    setSpeechPreferences({onDevice: false});
                    try {
                        instance.stop();
                    } catch {
                        // Already stopped; nothing to say about it.
                    }
                    try {
                        instance.start();
                        arm();
                        return;
                    } catch {
                        // The service will not start either: close as usual.
                    }
                }
                closed = true;
                recognition = undefined;
                disarm();
                if (levelTimer !== undefined) clearTimeout(levelTimer);
                level = 'silence';
                report();
                try {
                    instance.stop();
                } catch {
                    // A recogniser already stopped has nothing to say here.
                }
                onEnd?.('silence');
            };
            const arm = () => {
                disarm();
                // The wait a session allows itself depends on how far it has got:
                // nothing heard yet is a warm-up, a voice with no words is a
                // recogniser still working, and a transcription is the only state
                // where the pause means what it says (`D-772`). Each restart of the
                // wait is counted, so a bar can be drawn from the top again
                // (`D-775`).
                idle += 1;
                idleTimer = setTimeout(expire, wait());
                report();
            };

            if (preferences.onDevice && localRecognitionAvailable(Constructor)) {
                instance.processLocally = true;
                // Only a model the device already has is used. `downloadable` is
                // a 100 MB download the person did not ask for, and asking for it
                // here would either stall the first phrase or fail it, so the
                // service answers instead (`D-763`).
                const verdict = await localAvailability(Constructor, language);
                if (verdict === 'unavailable' || verdict === 'downloadable') {
                    instance.processLocally = false;
                }
            }
            // A stop that landed while the language was being checked owns the
            // microphone already.
            if (closed) return;

            instance.lang = language;
            instance.continuous = true;
            instance.interimResults = true;
            instance.onresult = event => {
                // A recogniser reports what it heard a moment after it was told to
                // stop, so a session that has already closed must not take the
                // words — and above all must not republish itself as listening,
                // which is what lit the box up again after a pause (`D-766`).
                if (closed) return;
                let interim = '';
                let final = '';
                for (let index = event.resultIndex; index < event.results.length; index++) {
                    const result = event.results[index];
                    const transcript = result?.[0]?.transcript ?? '';
                    if (result?.isFinal) final += transcript;
                    else interim += transcript;
                }
                // `heard` first: it is what chooses the length of the wait, so the
                // clock must be armed with the state this result just established
                // (`D-772`).
                if (interim || final) heard = true;
                // A result is the best evidence there is that someone is speaking.
                hold('speech');
                arm();
                onPhrase({interim: interim.trim(), final: final.trim()});
            };
            // The clock is a *pause*, so it starts when speech ends, not when the
            // session does: a service that takes three seconds to produce its first
            // interim result would otherwise be cut off in the middle of the
            // sentence that result was going to contain (`D-772`).
            instance.onspeechstart = () => {
                if (closed) return;
                spoke = true;
                hold('speech');
                arm();
            };
            instance.onspeechend = () => {
                if (closed) return;
                // Back to a sound rather than to silence: the room is still noisy
                // right after a voice, and a dot that drops straight to dim looks
                // like a fault (`D-774`).
                hold('sound', 400);
                arm();
            };
            // Any sound at all, which is the evidence that arrives before the
            // recogniser has decided whether it is a voice.
            instance.onsoundstart = () => {
                if (closed) return;
                if (level === 'silence') hold('sound');
            };
            instance.onsoundend = () => {
                if (closed) return;
                if (level === 'sound') hold('silence', 400);
            };
            instance.onerror = event => {
                if (event.error === 'no-speech') return;
                // A device model that does not cover the language is not a broken
                // microphone: the service can still recognise it, so the session
                // carries on without the on-device flag rather than failing. The
                // browser fires `end` after an error, and that restart is what
                // picks the new flag up (`D-763`).
                if (event.error === 'language-not-supported' && instance.processLocally) {
                    instance.processLocally = false;
                    return;
                }
                fail(event.error);
            };
            instance.onend = () => {
                if (closed || recognition !== instance) return;
                try {
                    instance.start();
                    arm();
                } catch {
                    fail('aborted');
                }
            };
            try {
                instance.start();
            } catch {
                // A flag the recogniser cannot honour surfaces here rather than in
                // `onerror`, and the difference between asking the service and
                // failing is whether the person can dictate at all (`D-763`).
                if (!instance.processLocally) {
                    fail('aborted');
                    return;
                }
                instance.processLocally = false;
                try {
                    instance.start();
                } catch {
                    fail('aborted');
                    return;
                }
            }
            arm();
        },
        stop() {
            closed = true;
            disarm();
            recognition?.stop();
            recognition = undefined;
        },
    };
}

// ── sherpa-onnx, loaded optionally ─────────────────────────────────────────

/** A recogniser stream: what the audio is fed into. */
export interface ISherpaStream {
    acceptWaveform(sampleRate: number, samples: Float32Array): void;
}

/** The slice of `sherpa-onnx` this module uses, so the package never has to be installed. */
export interface ISherpaRecognizer {
    createStream(): ISherpaStream;
    isReady(stream: ISherpaStream): boolean;
    decode(stream: ISherpaStream): void;
    isEndpoint(stream: ISherpaStream): boolean;
    reset(stream: ISherpaStream): void;
    getResult(stream: ISherpaStream): {text: string};
}

export interface ISherpaModule {
    createOnlineRecognizer(config: unknown): ISherpaRecognizer;
}

/** The rate the models expect; the capture is resampled into it. */
const SHERPA_SAMPLE_RATE = 16_000;

/**
 * The worklet that hands the raw samples over.
 *
 * A `ScriptProcessorNode` would be shorter, but it is deprecated and it only
 * runs while it is connected to the destination, which means routing the person's
 * own microphone back at them.
 */
const CAPTURE_WORKLET = `
class BlongSpeechCapture extends AudioWorkletProcessor {
    process(inputs) {
        const channel = inputs[0] && inputs[0][0];
        if (channel && channel.length) this.port.postMessage(channel.slice(0));
        return true;
    }
}
registerProcessor('blong-speech-capture', BlongSpeechCapture);
`;

/** The name the worklet registers itself under, and the engine asks for. */
const CAPTURE_WORKLET_NAME = 'blong-speech-capture';

/** How loud a frame has to be before the person counts as still speaking (`D-772`). */
const SHERPA_SPEECH_LEVEL = 0.02;

/** How loud a frame has to be before it counts as a sound at all (`D-774`). */
const SHERPA_SOUND_LEVEL = 0.006;

/**
 * What this frame holds: a voice, some other sound, or a room.
 *
 * The model itself never reports that nothing was said — it hears a pause and
 * waits — so both the silence clock and the indicator have to be decided on the
 * audio. Two thresholds rather than one, because a fan and a voice are different
 * answers to a person looking at the dot (`D-774`).
 */
function frameLevel(samples: Float32Array): SpeechLevel {
    let energy = 0;
    for (let index = 0; index < samples.length; index++) energy += samples[index] * samples[index];
    const rms = Math.sqrt(energy / Math.max(samples.length, 1));
    if (rms > SHERPA_SPEECH_LEVEL) return 'speech';
    return rms > SHERPA_SOUND_LEVEL ? 'sound' : 'silence';
}

/** Everything the sherpa engine reaches the browser through; injected for tests. */
export interface ISherpaEnvironment {
    loadModule?: (moduleName: string) => Promise<ISherpaModule>;
    getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
    createAudioContext?: (sampleRate: number) => AudioContext;
    /** The capture node; injected because jsdom has no `AudioWorkletNode`. */
    createWorkletNode?: (context: AudioContext) => AudioWorkletNode;
    /** How long a pause ends the session; default `SPEECH_SILENCE_MS`. */
    silenceMs?: number;
    /** How long a session waits for a first voice; default `SPEECH_START_GRACE_MS`. */
    startGraceMs?: number;
    /** How long a voice has to produce words; default `SPEECH_FIRST_RESULT_MS`. */
    firstResultMs?: number;
}

const loadedModules = new Map<string, Promise<ISherpaModule>>();
const recognizers = new Map<string, Promise<ISherpaRecognizer>>();

/**
 * The shipped loader: a real dynamic import, so the optional package is not
 * required to install.
 *
 * Exported because it is the one thing a capability probe has to exercise
 * directly: calling it imports the module, which downloads no model, while
 * starting a session would fetch 73 MB.
 */
export function loadSherpaModule(moduleName = 'sherpa-onnx'): Promise<ISherpaModule> {
    const cached = loadedModules.get(moduleName);
    if (cached) return cached;
    const loaded = import(/* @vite-ignore */ moduleName).then(
        (module: ISherpaModule | {default: ISherpaModule}) =>
            ('createOnlineRecognizer' in module
                ? module
                : (module as {default: ISherpaModule}).default) as ISherpaModule,
    );
    loadedModules.set(moduleName, loaded);
    // A failed import is not cached: the deployment may add the package, or fix
    // a module URL, without a reload of the page being required twice.
    loaded.catch(() => loadedModules.delete(moduleName));
    return loaded;
}

/**
 * The recogniser for one model, kept between sessions.
 *
 * Creating it is what downloads and compiles the model, so a second callout in
 * the same review must not pay for it again. Keyed by the model URLs: two suites
 * in one page (a portal of portals) can name different models.
 */
function sherpaRecognizer(config: ISherpaSpeechConfig, environment: ISherpaEnvironment) {
    const key = JSON.stringify(config);
    const cached = recognizers.get(key);
    if (cached) return cached;
    const load = environment.loadModule ?? loadSherpaModule;
    const created = load(config.module ?? 'sherpa-onnx').then(module =>
        module.createOnlineRecognizer({
            featConfig: {sampleRate: SHERPA_SAMPLE_RATE, featureDim: 80},
            modelConfig: {
                transducer: {
                    encoder: config.encoder,
                    decoder: config.decoder,
                    joiner: config.joiner,
                },
                tokens: config.tokens,
                numThreads: config.numThreads ?? 1,
                provider: 'cpu',
                debug: 0,
            },
            decodingMethod: 'greedy_search',
            maxActivePaths: 4,
        }),
    );
    recognizers.set(key, created);
    created.catch(() => recognizers.delete(key));
    return created;
}

/**
 * Resample to the model's rate with linear interpolation.
 *
 * The device rarely runs at 16 kHz, and a model fed 48 kHz audio transcribes
 * noise: the browser gives no way to demand a rate, so the conversion is ours.
 */
export function resample(samples: Float32Array, from: number, to: number): Float32Array {
    if (from === to) return samples;
    const ratio = from / to;
    const length = Math.floor(samples.length / ratio);
    const resampled = new Float32Array(length);
    for (let index = 0; index < length; index++) {
        const position = index * ratio;
        const before = Math.floor(position);
        const after = Math.min(before + 1, samples.length - 1);
        const fraction = position - before;
        resampled[index] = samples[before] * (1 - fraction) + samples[after] * fraction;
    }
    return resampled;
}

/**
 * Dictation through a model that runs in the page.
 *
 * The microphone is opened at start and closed at stop; the recogniser itself
 * outlives the session (`sherpaRecognizer`). Endpoint detection is what turns a
 * pause into a finished phrase, which is the only place a final result comes from
 * in a streaming model. A pause of `SPEECH_SILENCE_MS` closes the session as an
 * ordinary end (`D-765`), so a box does not sit listening to an empty room.
 */
export async function createSherpaEngine(
    config: ISherpaSpeechConfig,
    environment: ISherpaEnvironment = {},
): Promise<ISpeechEngine> {
    const getUserMedia =
        environment.getUserMedia ??
        ((constraints: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(constraints));
    const createAudioContext =
        environment.createAudioContext ?? ((sampleRate: number) => new AudioContext({sampleRate}));
    const silenceMs = environment.silenceMs ?? SPEECH_SILENCE_MS;
    const startGraceMs = environment.startGraceMs ?? SPEECH_START_GRACE_MS;
    const firstResultMs = environment.firstResultMs ?? SPEECH_FIRST_RESULT_MS;

    let media: MediaStream | undefined;
    let context: AudioContext | undefined;
    let sink: AudioWorkletNode | ScriptProcessorNode | undefined;
    let stream: ISherpaStream | undefined;
    let recognizer: ISherpaRecognizer | undefined;
    let spoken = '';
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let levelTimer: ReturnType<typeof setTimeout> | undefined;
    let end: ((reason?: string) => void) | undefined;
    let activity: ((activity: ISpeechActivity) => void) | undefined;
    /** Whether a transcription has ever come out of this session (`D-772`). */
    let heard = false;
    /** Whether a voice has been in the audio (`D-772`). */
    let spoke = false;
    /** What is in the microphone, as last reported (`D-774`). */
    let level: SpeechLevel = 'silence';
    /** How many waits this session has counted down (`D-775`). */
    let idle = 0;

    const disarm = () => {
        if (idleTimer !== undefined) clearTimeout(idleTimer);
        idleTimer = undefined;
    };

    const wait = () => (heard ? silenceMs : spoke ? firstResultMs : startGraceMs);
    const report = () => activity?.({level, waitMs: wait(), idle});
    const setLevel = (next: SpeechLevel) => {
        if (next === level) return;
        level = next;
        report();
    };
    /** Say what is in the microphone, and forget it when the audio stops saying it (`D-774`). */
    const hold = (next: SpeechLevel, ms = 700) => {
        setLevel(next);
        if (levelTimer !== undefined) clearTimeout(levelTimer);
        levelTimer = setTimeout(() => {
            levelTimer = undefined;
            setLevel('silence');
        }, ms);
    };

    const release = () => {
        disarm();
        if (levelTimer !== undefined) clearTimeout(levelTimer);
        levelTimer = undefined;
        level = 'silence';
        report();
        for (const track of media?.getTracks() ?? []) track.stop();
        media = undefined;
        sink?.disconnect();
        sink = undefined;
        void context?.close();
        context = undefined;
        stream = undefined;
        end = undefined;
        activity = undefined;
    };

    const arm = () => {
        disarm();
        const session = end;
        // The same tiers as the Web Speech engine (`D-772`), counted so the bar
        // under the caption can start again (`D-775`).
        idle += 1;
        idleTimer = setTimeout(() => {
            idleTimer = undefined;
            release();
            session?.('silence');
        }, wait());
        report();
    };

    return {
        async start(onPhrase, onEnd, onActivity) {
            recognizer = await sherpaRecognizer(config, environment);
            stream = recognizer.createStream();
            spoken = '';
            heard = false;
            spoke = false;
            level = 'silence';
            idle = 0;
            activity = onActivity;

            const accept = (samples: Float32Array) => {
                if (!recognizer || !stream) return;
                // Only a voice holds the session open: the silence clock is reset
                // by speech, never by the frames of an empty room or a fan.
                const frame = frameLevel(samples);
                if (frame === 'speech') {
                    spoke = true;
                    hold('speech');
                    arm();
                } else if (frame === 'sound') {
                    hold('sound');
                }
                const rate = context?.sampleRate ?? SHERPA_SAMPLE_RATE;
                const pcm = resample(samples, rate, SHERPA_SAMPLE_RATE);
                stream.acceptWaveform(SHERPA_SAMPLE_RATE, pcm);
                while (recognizer.isReady(stream)) recognizer.decode(stream);
                const text = recognizer.getResult(stream).text.trim();
                if (text && !heard) {
                    // Words are coming back now, so the pause becomes the one the
                    // person was promised (`D-772`).
                    heard = true;
                    arm();
                }
                if (recognizer.isEndpoint(stream)) {
                    recognizer.reset(stream);
                    if (text) onPhrase({interim: '', final: text});
                    return;
                }
                if (text && text !== spoken) {
                    spoken = text;
                    onPhrase({interim: text, final: ''});
                }
            };

            try {
                media = await getUserMedia({
                    audio: {channelCount: 1, echoCancellation: true, noiseSuppression: true},
                });
                context = createAudioContext(SHERPA_SAMPLE_RATE);
                const source = context.createMediaStreamSource(media);
                if (context.audioWorklet) {
                    const url = URL.createObjectURL(
                        new Blob([CAPTURE_WORKLET], {type: 'text/javascript'}),
                    );
                    try {
                        await context.audioWorklet.addModule(url);
                    } finally {
                        URL.revokeObjectURL(url);
                    }
                    const node =
                        environment.createWorkletNode?.(context) ??
                        new AudioWorkletNode(context, CAPTURE_WORKLET_NAME);
                    node.port.onmessage = event => accept(event.data as Float32Array);
                    sink = node;
                } else {
                    // Older Safari has no worklet; a script processor is the only
                    // capture left, and it needs a route to the destination to run.
                    const node = context.createScriptProcessor(4096, 1, 1);
                    node.onaudioprocess = event =>
                        accept(event.inputBuffer.getChannelData(0).slice(0));
                    sink = node;
                }
                source.connect(sink);
                const mute = context.createGain();
                mute.gain.value = 0;
                sink.connect(mute);
                mute.connect(context.destination);
                end = onEnd;
                arm();
            } catch (error) {
                release();
                throw error;
            }
        },
        stop() {
            release();
        },
    };
}

// ── Choosing an engine ─────────────────────────────────────────────────────

/** Everything the engines reach the browser through, injected so a test needs no microphone. */
export interface ISpeechEnvironment extends ISherpaEnvironment {
    recognition?: ISpeechRecognitionConstructor;
}

/**
 * A stand-in the engines fall back to when a caller supplies none (`@@D-760`).
 *
 * Empty, every engine uses the browser's own APIs. A story cannot load a 73 MB
 * model — Storybook has no model server and no microphone — so it installs a
 * scripted recogniser and audio graph here, and the sherpa path becomes
 * something to watch rather than something to read about.
 */
let standing: ISpeechEnvironment = {};

/** Put a stand-in in place of the browser; `undefined` puts the browser back. */
export function installSpeechEnvironment(environment?: ISpeechEnvironment): void {
    standing = environment ?? {};
}

/** The language tag an engine is handed. */
export function speechLanguage(language?: string): string {
    if (language) return language;
    const scope = globalThis as {navigator?: Navigator};
    return scope.navigator?.language ?? ENGLISH_LANGUAGE;
}

/**
 * The language a session dictates in (`D-761`).
 *
 * The portal's own language wins, because a person reads the application in it
 * and a comment about a Bulgarian screen is going to be spoken in Bulgarian;
 * `speech.language` is only the fallback for a page that has no language of its
 * own. The English switch overrides both, which is the one way to dictate in
 * English over a portal that is not.
 */
export function resolveSpeechLanguage(
    sessionLanguage: string | undefined,
    configured?: string,
): string {
    if (preferences.english) return ENGLISH_LANGUAGE;
    return speechLanguage(sessionLanguage || configured);
}

/** Can speech be recognised on this device rather than by a service (`D-763`)? */
export function localSpeechAvailable(environment: ISpeechEnvironment = standing): boolean {
    return localRecognitionAvailable(environment.recognition ?? speechRecognitionConstructor());
}

/** Can this browser dictate at all, with the configured engine? */
export function speechSupported(
    engine: 'webSpeech' | 'sherpa' = 'webSpeech',
    environment: ISpeechEnvironment = standing,
): boolean {
    if (typeof window === 'undefined') return false;
    if (engine === 'webSpeech') {
        return Boolean(environment.recognition ?? speechRecognitionConstructor());
    }
    const scope = globalThis as {navigator?: Navigator; AudioContext?: unknown};
    return Boolean(
        (environment.getUserMedia ?? scope.navigator?.mediaDevices) &&
        (environment.createAudioContext ?? scope.AudioContext),
    );
}

/**
 * The engine the configuration names, or `undefined` when this browser cannot run
 * it.
 *
 * A misconfigured sherpa block throws rather than answering `undefined`: the
 * suite asked for a model and did not say where its files are, which is a fault
 * in the deployment and must not read as "this browser cannot dictate".
 */
export async function createSpeechEngine(
    config: IFeedbackSpeechConfig | undefined,
    environment: ISpeechEnvironment = standing,
): Promise<ISpeechEngine | undefined> {
    if (config?.engine === 'sherpa') {
        if (!config.sherpa?.encoder) {
            throw new Error(
                'feedback speech: the sherpa engine needs encoder, decoder, joiner and tokens URLs',
            );
        }
        return createSherpaEngine(config.sherpa, environment);
    }
    return createWebSpeechEngine(
        resolveSpeechLanguage(undefined, config?.language),
        environment.recognition ?? speechRecognitionConstructor(),
        {
            silenceMs: environment.silenceMs,
            startGraceMs: environment.startGraceMs,
            firstResultMs: environment.firstResultMs,
        },
    );
}

// ── The microphone, and the one place a prompt is allowed ──────────────────

/**
 * What the browser says about the microphone, without asking for it.
 *
 * `unknown` covers the browsers that do not answer the query at all (Safari
 * before 16) and a name they reject, and it is read as "not granted": an
 * automatic start must never be the thing that raises a prompt (`@@D-758`).
 */
export async function microphonePermission(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
    const scope = globalThis as {navigator?: Navigator};
    const permissions = scope.navigator?.permissions;
    if (!permissions?.query) return 'unknown';
    try {
        const status = await permissions.query({
            name: 'microphone' as PermissionName,
        });
        return status.state as 'granted' | 'denied' | 'prompt';
    } catch {
        return 'unknown';
    }
}

// ── Joining what was heard to what was typed ──────────────────────────────

/**
 * Append one finished phrase to the comment.
 *
 * Dictation and typing share one text: the person may have written a sentence and
 * then spoken the rest, so the phrase is joined with a single space unless the
 * text already ends in whitespace.
 */
export function appendSpeech(text: string, phrase: string): string {
    const addition = phrase.trim();
    if (!addition) return text;
    if (!text) return addition;
    return /\s$/.test(text) ? `${text}${addition}` : `${text} ${addition}`;
}

/**
 * Write the punctuation a speaker leaves out (`D-762`).
 *
 * No engine here writes it: the Web Speech API returns bare words and a Zipformer
 * model produces no punctuation at all, so a comment arrives as one long clause.
 * The correction is deliberately small — a capital at the start and a full stop at
 * the end, a capital after each finished sentence, one space between the words —
 * because anything more would be guessing at what the person meant. A phrase that
 * already ends in `.`, `?`, `!` or `…` is left as it is; a decimal or a version
 * number is not a sentence break, since a break needs a space after it.
 */
export function punctuateSpeech(text: string): string {
    const collapsed = text.replace(/\s+/g, ' ').trim();
    if (!collapsed) return '';
    const sentenceCased = collapsed.replace(
        /(^|[.!?]\s+)(\p{Ll})/gu,
        (_match, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`,
    );
    return /[.!?…]$/.test(sentenceCased) ? sentenceCased : `${sentenceCased}.`;
}

/**
 * What is left of a phrase once the words already handled are taken off it
 * (`D-764`).
 *
 * A phrase is heard twice: once while it is being recognised, and again when it
 * finishes. A person may take the words under way into the comment, or dismiss
 * them, before that second report arrives — so the words already handled are
 * remembered and cut off the front of anything further, or the phrase would be
 * written twice. The comparison is by word and ignores case, because an engine
 * re-cases its interim result as the sentence becomes clear.
 */
export function remainingSpeech(text: string, handled: string): string {
    const done = handled.trim().split(/\s+/).filter(Boolean);
    if (done.length === 0) return text.trim();
    const incoming = text.trim().split(/\s+/).filter(Boolean);
    for (let index = 0; index < done.length; index++) {
        if (done[index].toLocaleLowerCase() !== incoming[index]?.toLocaleLowerCase()) {
            return incoming.join(' ');
        }
    }
    // Every handled word matched: either the engine has not caught up, or only
    // the tail of the phrase is left to write.
    return incoming.slice(done.length).join(' ');
}
