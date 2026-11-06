/**
 * speech.test.ts — dictation for the feedback mode (`@@D-758`).
 *
 * Covers what a browser cannot be asked to do in a test: the phrase bookkeeping
 * both engines share, the Web Speech restart that keeps a box listening, the
 * sherpa engine driven through an injected module, and the rule that an automatic
 * start never raises a permission prompt.
 */

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';

import {
    appendSpeech,
    createSherpaEngine,
    createSpeechEngine,
    createWebSpeechEngine,
    installSpeechEnvironment,
    localSpeechAvailable,
    microphonePermission,
    punctuateSpeech,
    remainingSpeech,
    resample,
    resetSpeechPreferences,
    resolveSpeechLanguage,
    setSpeechPreferences,
    SPEECH_FIRST_RESULT_MS,
    SPEECH_PREFERENCES_DEFAULT,
    SPEECH_START_GRACE_MS,
    speechLanguage,
    speechPreferences,
    speechSupported,
    subscribeSpeechPreferences,
    type ISherpaModule,
    type ISpeechEngine,
    type ISpeechRecognition,
    type ISpeechRecognitionConstructor,
    type ISpeechResultEvent,
} from './speech.js';
import {
    speechDropInterim,
    speechListen,
    speechRestart,
    speechSnapshot,
    speechStop,
    speechTakeInterim,
    speechToggle,
} from './useFeedbackSpeech.js';

// ── A recogniser that can be driven by hand ────────────────────────────────

class FakeRecognition implements ISpeechRecognition {
    static instances: FakeRecognition[] = [];
    lang = '';
    continuous = false;
    interimResults = false;
    /** Declared, never assigned: the fake keeps it on the prototype, as Chrome does. */
    declare processLocally?: boolean;
    start = vi.fn();
    stop = vi.fn();
    abort = vi.fn();
    onresult: ((event: ISpeechResultEvent) => void) | null = null;
    onerror: ((event: {error: string}) => void) | null = null;
    onend: (() => void) | null = null;
    onspeechstart: ((event: Event) => void) | null = null;
    onspeechend: ((event: Event) => void) | null = null;
    onsoundstart: ((event: Event) => void) | null = null;
    onsoundend: ((event: Event) => void) | null = null;

    constructor() {
        FakeRecognition.instances.push(this);
    }

    /** One result event, as the browser would raise it. */
    hear(transcript: string, isFinal = false): void {
        this.onresult?.({
            resultIndex: 0,
            results: [{isFinal, length: 1, 0: {transcript}}],
        });
    }
}

const recognitionConstructor = FakeRecognition as unknown as ISpeechRecognitionConstructor;

// Chrome keeps the on-device flag on the prototype, which is what lets the mode
// answer "can this browser do it" without building a recogniser; the fake keeps
// it there too.
FakeRecognition.prototype.processLocally = false;

function lastRecognition(): FakeRecognition {
    const instance = FakeRecognition.instances.at(-1);
    if (!instance) throw new Error('no recogniser was constructed');
    return instance;
}

/** The Web Speech engine, asserted present — the tests below need it. */
function webSpeech(language: string): ISpeechEngine {
    const engine = createWebSpeechEngine(language, recognitionConstructor);
    if (!engine) throw new Error('the browser recogniser was not wrapped');
    return engine;
}

beforeEach(() => {
    FakeRecognition.instances = [];
    resetSpeechPreferences();
    // jsdom has no object URLs, and the engine hands the worklet over as one.
    Object.assign(URL, {
        createObjectURL: () => 'blob:speech-capture',
        revokeObjectURL: () => undefined,
    });
});

afterEach(() => {
    speechStop();
    resetSpeechPreferences();
    installSpeechEnvironment(undefined);
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

// ── What both engines share ────────────────────────────────────────────────

describe('the words a comment gains', () => {
    test('joins a finished phrase to whatever was typed', () => {
        expect(appendSpeech('', 'the total is wrong')).toBe('the total is wrong');
        expect(appendSpeech('the total', 'is wrong')).toBe('the total is wrong');
        // Typing a trailing space already separated the two.
        expect(appendSpeech('the total ', 'is wrong')).toBe('the total is wrong');
        expect(appendSpeech('the total', '  ')).toBe('the total');
        expect(appendSpeech('the total', ' is wrong ')).toBe('the total is wrong');
    });

    test('resamples the capture to the rate the model expects', () => {
        expect(resample(new Float32Array([1, 2]), 16_000, 16_000)).toHaveLength(2);
        const at48k = new Float32Array(48);
        at48k.fill(0.5);
        const at16k = resample(at48k, 48_000, 16_000);
        expect(at16k).toHaveLength(16);
        expect(at16k[0]).toBeCloseTo(0.5, 5);
    });

    test('falls back to the browser language, then to English', () => {
        expect(speechLanguage('bg-BG')).toBe('bg-BG');
        expect(speechLanguage()).toBe(navigator.language);
    });

    test('cuts off the words of a phrase that are already accounted for', () => {
        expect(remainingSpeech('the total is wrong', '')).toBe('the total is wrong');
        expect(remainingSpeech('the total is wrong', 'the total')).toBe('is wrong');
        // The engine re-cases its interim result as the sentence becomes clear.
        expect(remainingSpeech('The total is wrong', 'the total')).toBe('is wrong');
        // Nothing new yet: the engine has not caught up with the person.
        expect(remainingSpeech('the total', 'the total')).toBe('');
        // A different phrase is a new phrase, not a continuation.
        expect(remainingSpeech('another thing', 'the total')).toBe('another thing');
    });

    test('writes the punctuation a speaker leaves out', () => {
        expect(punctuateSpeech('the total is wrong')).toBe('The total is wrong.');
        expect(punctuateSpeech('  the   total  ')).toBe('The total.');
        expect(punctuateSpeech('')).toBe('');
        // A sentence that already ends is not given a second full stop.
        expect(punctuateSpeech('is it wrong?')).toBe('Is it wrong?');
        // A decimal is not a sentence break, and a finished sentence starts anew.
        expect(punctuateSpeech('version 1.5 broke it')).toBe('Version 1.5 broke it.');
        expect(punctuateSpeech('one. two')).toBe('One. Two.');
    });
});

// ── The switches a person sets ─────────────────────────────────────────────

describe('the dictation switches', () => {
    test('start punctuated, in the portal language and on the device', () => {
        expect(speechPreferences()).toEqual(SPEECH_PREFERENCES_DEFAULT);
        // On-device is the default: the silence that looked like a deaf model was
        // the pause clock counting a warm-up (`D-769` `D-772`).
        expect(speechPreferences()).toMatchObject({
            onDevice: true,
            punctuation: true,
            english: false,
        });
        expect(resolveSpeechLanguage('bg-BG')).toBe('bg-BG');
    });

    test('remember a change until they are reset', () => {
        const changes: number[] = [];
        const unsubscribe = subscribeSpeechPreferences(() => changes.push(1));

        setSpeechPreferences({english: true});
        expect(speechPreferences().english).toBe(true);
        expect(changes).toHaveLength(1);
        // Setting the value it already has is not a change.
        setSpeechPreferences({english: true});
        expect(changes).toHaveLength(1);

        expect(resolveSpeechLanguage('bg-BG')).toBe('en-US');
        resetSpeechPreferences();
        expect(speechPreferences()).toEqual(SPEECH_PREFERENCES_DEFAULT);
        expect(resolveSpeechLanguage('bg-BG')).toBe('bg-BG');
        unsubscribe();
    });

    test('the portal language wins over the one the block names', () => {
        expect(resolveSpeechLanguage('bg-BG', 'de-DE')).toBe('bg-BG');
        expect(resolveSpeechLanguage(undefined, 'de-DE')).toBe('de-DE');
        expect(resolveSpeechLanguage(undefined)).toBe(navigator.language);
    });

    test('the local switch is offered only where the browser can do it', () => {
        expect(localSpeechAvailable({})).toBe(false);
        expect(localSpeechAvailable({recognition: recognitionConstructor})).toBe(true);
    });
});

// ── The browser's own recogniser ───────────────────────────────────────────

describe('the Web Speech engine', () => {
    test('reports the phrase under way and the phrase that finished', async () => {
        const heard: Array<{interim: string; final: string}> = [];
        const engine = webSpeech('bg-BG');
        await engine.start(phrase => heard.push(phrase));

        const instance = lastRecognition();
        expect(instance.lang).toBe('bg-BG');
        expect(instance.continuous).toBe(true);
        expect(instance.interimResults).toBe(true);
        expect(instance.start).toHaveBeenCalledTimes(1);

        instance.hear('общата');
        instance.hear('сума е', true);
        expect(heard).toEqual([
            {interim: 'общата', final: ''},
            {interim: '', final: 'сума е'},
        ]);
        engine.stop();
        expect(instance.stop).toHaveBeenCalled();
    });

    test('restarts itself when the browser ends recognition on a pause', async () => {
        const engine = webSpeech('en-US');
        await engine.start(() => undefined);
        const instance = lastRecognition();

        instance.onend?.();
        expect(instance.start).toHaveBeenCalledTimes(2);

        // After a stop the session is over: the browser's own `end` must not
        // resurrect the microphone.
        engine.stop();
        instance.onend?.();
        expect(instance.start).toHaveBeenCalledTimes(2);
    });

    test('stays shut once the microphone was refused', async () => {
        const engine = webSpeech('en-US');
        await engine.start(() => undefined);
        const instance = lastRecognition();

        instance.onerror?.({error: 'not-allowed'});
        instance.onend?.();
        expect(instance.start).toHaveBeenCalledTimes(1);
    });

    test('keeps listening through silence but gives up on a broken service', async () => {
        const engine = webSpeech('en-US');
        await engine.start(() => undefined);
        const instance = lastRecognition();

        // `no-speech` is a quiet room, which is what a person thinking looks
        // like: the session survives it.
        instance.onerror?.({error: 'no-speech'});
        instance.onend?.();
        expect(instance.start).toHaveBeenCalledTimes(2);

        // `network` is the recognition service being unreachable, and a restart
        // would raise it again for as long as the box is open.
        instance.onerror?.({error: 'network'});
        instance.onend?.();
        expect(instance.start).toHaveBeenCalledTimes(2);
    });

    test('is absent where the browser has no recogniser', () => {
        expect(createWebSpeechEngine('en-US', undefined)).toBeUndefined();
        expect(speechSupported('webSpeech', {recognition: recognitionConstructor})).toBe(true);
    });

    test('asks for on-device recognition only when the switch is on', async () => {
        setSpeechPreferences({onDevice: true});
        const local = webSpeech('bg-BG');
        await local.start(() => undefined);
        expect(lastRecognition().processLocally).toBe(true);
        local.stop();

        setSpeechPreferences({onDevice: false});
        const cloud = webSpeech('bg-BG');
        await cloud.start(() => undefined);
        expect(lastRecognition().processLocally).toBe(false);
        cloud.stop();
    });

    test('falls back to the service when the device has no model for the language', async () => {
        setSpeechPreferences({onDevice: true});
        const CloudOnly = Object.assign(class extends FakeRecognition {}, {
            available: () => Promise.resolve('unavailable'),
        }) as unknown as ISpeechRecognitionConstructor;

        const engine = createWebSpeechEngine('bg-BG', CloudOnly);
        await engine?.start(() => undefined);
        expect(lastRecognition().processLocally).toBe(false);
        engine?.stop();
    });

    test('falls back to the service when the device refuses the language', async () => {
        setSpeechPreferences({onDevice: true});
        const engine = webSpeech('en-US');
        await engine.start(() => undefined);
        const instance = lastRecognition();
        expect(instance.processLocally).toBe(true);

        // Asking for a language the device has no model for is not a broken
        // microphone. The flag goes off and the browser's own restart picks it up,
        // instead of the session failing outright (`D-763`).
        instance.onerror?.({error: 'language-not-supported'});
        expect(instance.processLocally).toBe(false);
        instance.onend?.();
        expect(instance.start).toHaveBeenCalledTimes(2);
        engine.stop();
    });

    test('falls back to the service when the device flag cannot be honoured', async () => {
        setSpeechPreferences({onDevice: true});
        // A recogniser that refuses to start while the on-device flag is set, which
        // is how a browser with no model for the language behaves (`D-763`).
        const Picky = class extends FakeRecognition {
            start = vi.fn(() => {
                if (this.processLocally) throw new Error('language-not-supported');
            });
        } as unknown as ISpeechRecognitionConstructor;

        const engine = createWebSpeechEngine('en-US', Picky);
        await engine?.start(() => undefined);
        expect(lastRecognition().processLocally).toBe(false);
        expect(lastRecognition().start).toHaveBeenCalledTimes(2);
        engine?.stop();
    });

    test('gives up on a device model that hears a voice and transcribes nothing', async () => {
        vi.useFakeTimers();
        setSpeechPreferences({onDevice: true});
        const endings: Array<string | undefined> = [];
        const engine = createWebSpeechEngine('en-US', recognitionConstructor, {silenceMs: 4000});
        await engine?.start(
            () => undefined,
            reason => endings.push(reason),
        );
        const instance = lastRecognition();
        expect(instance.processLocally).toBe(true);

        // Chrome says the model is available, the recogniser hears a voice, and no
        // word ever comes back: the service is tried instead of the session closing
        // on a silence the person did not make (`D-769`).
        instance.onspeechstart?.(new Event('speechstart'));
        vi.advanceTimersByTime(SPEECH_FIRST_RESULT_MS);
        expect(endings).toEqual([]);
        expect(instance.processLocally).toBe(false);
        expect(instance.start).toHaveBeenCalledTimes(2);
        // And the switch goes off, so the next box does not begin the same way.
        expect(speechPreferences().onDevice).toBe(false);

        vi.advanceTimersByTime(SPEECH_FIRST_RESULT_MS);
        expect(endings).toEqual(['silence']);
    });

    test('a transcribed phrase ends on a four-second pause', async () => {
        vi.useFakeTimers();
        const endings: Array<string | undefined> = [];
        const engine = createWebSpeechEngine('en-US', recognitionConstructor, {silenceMs: 4000});
        await engine?.start(
            () => undefined,
            reason => endings.push(reason),
        );
        const instance = lastRecognition();
        // A result restarts the clock, so a person who keeps talking is never cut
        // off mid-sentence.
        instance.hear('общата');
        vi.advanceTimersByTime(3999);
        expect(endings).toEqual([]);
        vi.advanceTimersByTime(1);
        expect(endings).toEqual(['silence']);
        expect(instance.stop).toHaveBeenCalled();
        // A session that already ended does not restart on the browser's `end`.
        instance.onend?.();
        expect(instance.start).toHaveBeenCalledTimes(1);
    });

    test('a session that hears nothing waits out the start grace', async () => {
        vi.useFakeTimers();
        const endings: Array<string | undefined> = [];
        const engine = createWebSpeechEngine('en-US', recognitionConstructor, {silenceMs: 4000});
        await engine?.start(
            () => undefined,
            reason => endings.push(reason),
        );

        // Recognition takes a while to become live, and that is not a pause: four
        // seconds of it would close a microphone the person was about to use
        // (`D-772`).
        vi.advanceTimersByTime(SPEECH_START_GRACE_MS - 1);
        expect(endings).toEqual([]);
        vi.advanceTimersByTime(1);
        expect(endings).toEqual(['silence']);
    });

    test('a voice with no words yet gets longer than a pause', async () => {
        vi.useFakeTimers();
        setSpeechPreferences({onDevice: false});
        const endings: Array<string | undefined> = [];
        const engine = createWebSpeechEngine('en-US', recognitionConstructor, {
            silenceMs: 4000,
            firstResultMs: 8000,
        });
        await engine?.start(
            () => undefined,
            reason => endings.push(reason),
        );

        lastRecognition().onspeechstart?.(new Event('speechstart'));
        vi.advanceTimersByTime(7999);
        expect(endings).toEqual([]);
        vi.advanceTimersByTime(1);
        expect(endings).toEqual(['silence']);
    });
});

// ── The model that runs in the page ───────────────────────────────────────

describe('the sherpa engine', () => {
    /** A recogniser whose endpoint answer the test controls. */
    function sherpaModule(options: {endpoint: boolean; text: string}) {
        const acceptWaveform = vi.fn();
        const recognizer = {
            createStream: () => ({acceptWaveform}),
            isReady: () => false,
            decode: () => undefined,
            isEndpoint: () => options.endpoint,
            reset: vi.fn(),
            getResult: () => ({text: options.text}),
        };
        const module: ISherpaModule = {createOnlineRecognizer: () => recognizer};
        return {module, acceptWaveform, recognizer};
    }

    /** The audio graph, with the capture node the test can speak into. */
    function capture() {
        let deliver: ((event: {data: Float32Array}) => void) | undefined;
        const node = {
            port: {
                set onmessage(handler: ((event: {data: Float32Array}) => void) | undefined) {
                    deliver = handler;
                },
                get onmessage() {
                    return deliver;
                },
            },
            connect: vi.fn(),
            disconnect: vi.fn(),
        };
        const track = {stop: vi.fn()};
        const context = {
            sampleRate: 16_000,
            audioWorklet: {addModule: vi.fn(() => Promise.resolve())},
            createMediaStreamSource: () => ({connect: vi.fn()}),
            createGain: () => ({gain: {value: 1}, connect: vi.fn()}),
            createScriptProcessor: vi.fn(),
            destination: {},
            close: vi.fn(() => Promise.resolve()),
        };
        const speak = (samples: Float32Array) => deliver?.({data: samples});
        return {node, context, track, speak};
    }

    const model = {
        encoder: 'https://models/encoder.int8.onnx',
        decoder: 'https://models/decoder.onnx',
        joiner: 'https://models/joiner.onnx',
        tokens: 'https://models/tokens.txt',
    };

    test('transcribes a phrase when the recogniser reaches an endpoint', async () => {
        const {module, acceptWaveform, recognizer} = sherpaModule({
            endpoint: true,
            text: 'добър ден',
        });
        const {node, context, track, speak} = capture();
        const heard: Array<{interim: string; final: string}> = [];

        const engine = await createSherpaEngine(
            {...model, tokens: 'https://models/endpoint-tokens.txt'},
            {
                loadModule: () => Promise.resolve(module),
                getUserMedia: () => Promise.resolve({getTracks: () => [track]} as never),
                createAudioContext: () => context as never,
                createWorkletNode: () => node as never,
            },
        );
        await engine.start(phrase => heard.push(phrase));

        speak(new Float32Array(1600));
        expect(acceptWaveform).toHaveBeenCalledTimes(1);
        expect(recognizer.reset).toHaveBeenCalled();
        expect(heard).toEqual([{interim: '', final: 'добър ден'}]);

        engine.stop();
        expect(track.stop).toHaveBeenCalled();
        expect(context.close).toHaveBeenCalled();
    });

    test('reports the phrase under way without finalising it', async () => {
        const {module} = sherpaModule({endpoint: false, text: 'общата'});
        const {node, context, speak} = capture();
        const heard: Array<{interim: string; final: string}> = [];

        const engine = await createSherpaEngine(
            {...model, tokens: 'https://models/interim-tokens.txt'},
            {
                loadModule: () => Promise.resolve(module),
                getUserMedia: () => Promise.resolve({getTracks: () => []} as never),
                createAudioContext: () => context as never,
                createWorkletNode: () => node as never,
            },
        );
        await engine.start(phrase => heard.push(phrase));

        speak(new Float32Array(1600));
        speak(new Float32Array(1600));
        // A refinement is only published when the words actually changed.
        expect(heard).toEqual([{interim: 'общата', final: ''}]);
        engine.stop();
    });

    test('a pause in the capture ends the session the way a switch does', async () => {
        vi.useFakeTimers();
        const {module} = sherpaModule({endpoint: false, text: ''});
        const {node, context, track} = capture();
        const endings: Array<string | undefined> = [];

        const engine = await createSherpaEngine(
            {...model, tokens: 'https://models/silence-tokens.txt'},
            {
                loadModule: () => Promise.resolve(module),
                getUserMedia: () => Promise.resolve({getTracks: () => [track]} as never),
                createAudioContext: () => context as never,
                createWorkletNode: () => node as never,
                silenceMs: 4000,
                startGraceMs: 4000,
            },
        );
        await engine.start(
            () => undefined,
            reason => endings.push(reason),
        );

        // Silence is not speech: the clock keeps running through an empty frame.
        node.port.onmessage?.({data: new Float32Array(1600)});
        vi.advanceTimersByTime(3999);
        expect(endings).toEqual([]);
        vi.advanceTimersByTime(1);
        expect(endings).toEqual(['silence']);
        expect(track.stop).toHaveBeenCalled();
    });

    test('refuses to start without the model files', async () => {
        await expect(
            createSpeechEngine({
                engine: 'sherpa',
                // The type forbids this; a JSON config can still arrive without it.
                sherpa: undefined as never,
            }),
        ).rejects.toThrow(/encoder, decoder, joiner and tokens/);
    });
});

// ── Permission, and the rule that an automatic start keeps quiet ───────────

/** Report one microphone permission state, as the browser would. */
function permission(state: 'granted' | 'denied' | 'prompt' | 'none'): void {
    Object.defineProperty(navigator, 'permissions', {
        configurable: true,
        value: state === 'none' ? undefined : {query: () => Promise.resolve({state})},
    });
}

describe('the microphone', () => {
    test('reads the permission the browser already granted', async () => {
        permission('granted');
        await expect(microphonePermission()).resolves.toBe('granted');
        permission('prompt');
        await expect(microphonePermission()).resolves.toBe('prompt');
        // A browser that does not answer the query is not a granted microphone.
        permission('none');
        await expect(microphonePermission()).resolves.toBe('unknown');
    });

    test('never raises a prompt on its own, and says so once it is granted', async () => {
        vi.stubGlobal('webkitSpeechRecognition', recognitionConstructor);
        const heard: Array<[string, string]> = [];

        permission('prompt');
        expect(
            await speechListen(
                'marine.coral.browse/card:master',
                {engine: 'webSpeech'},
                {
                    auto: true,
                    onText: (id, text) => heard.push([id, text]),
                },
            ),
        ).toBe(false);
        expect(FakeRecognition.instances).toHaveLength(0);
        expect(speechSnapshot().listeningTargetId).toBeNull();

        permission('granted');
        expect(
            await speechListen(
                'marine.coral.browse/card:master',
                {engine: 'webSpeech'},
                {
                    auto: true,
                    onText: (id, text) => heard.push([id, text]),
                },
            ),
        ).toBe(true);
        expect(speechSnapshot().listeningTargetId).toBe('marine.coral.browse/card:master');

        const instance = lastRecognition();
        instance.hear('the total');
        expect(speechSnapshot().interimText).toBe('the total');
        instance.hear('is wrong', true);
        // Punctuation is on by default, so the finished phrase arrives as a
        // sentence rather than the bare words the engine reports (`D-762`).
        expect(heard).toEqual([['marine.coral.browse/card:master', 'Is wrong.']]);
        expect(speechSnapshot().interimText).toBe('');
    });

    test('dictates in the portal language', async () => {
        vi.stubGlobal('webkitSpeechRecognition', recognitionConstructor);
        expect(
            await speechListen(
                'marine.coral.browse/card:master',
                {engine: 'webSpeech'},
                {language: 'bg-BG'},
            ),
        ).toBe(true);
        expect(lastRecognition().lang).toBe('bg-BG');
    });

    test('the phrase under way can be taken before the engine finishes it', async () => {
        vi.stubGlobal('webkitSpeechRecognition', recognitionConstructor);
        const heard: Array<[string, string]> = [];
        expect(
            await speechListen(
                'marine.coral.browse/card:master',
                {engine: 'webSpeech'},
                {onText: (id, text) => heard.push([id, text])},
            ),
        ).toBe(true);
        const instance = lastRecognition();

        instance.hear('the total');
        expect(speechTakeInterim()).toBe('the total');
        expect(speechSnapshot().interimText).toBe('');

        // The engine refines the same phrase: only the words not yet taken are
        // drawn, and the finished phrase adds only what is left (`D-764`).
        instance.hear('the total is wrong');
        expect(speechSnapshot().interimText).toBe('is wrong');
        instance.hear('the total is wrong', true);
        expect(heard).toEqual([['marine.coral.browse/card:master', 'is wrong']]);
        expect(speechSnapshot().interimText).toBe('');
    });

    test('the phrase under way can be dropped without writing it', async () => {
        vi.stubGlobal('webkitSpeechRecognition', recognitionConstructor);
        const heard: Array<[string, string]> = [];
        expect(
            await speechListen(
                'marine.coral.browse/card:master',
                {engine: 'webSpeech'},
                {onText: (id, text) => heard.push([id, text])},
            ),
        ).toBe(true);
        const instance = lastRecognition();

        instance.hear('this is wrong');
        speechDropInterim();
        expect(speechSnapshot().interimText).toBe('');
        expect(speechTakeInterim()).toBeUndefined();

        instance.hear('this is wrong twice', true);
        expect(heard).toEqual([['marine.coral.browse/card:master', 'twice']]);
    });

    test('a pause closes the box without an error', async () => {
        vi.useFakeTimers();
        installSpeechEnvironment({
            recognition: recognitionConstructor,
            silenceMs: 4000,
            startGraceMs: 4000,
        });
        expect(await speechListen('marine.coral.browse/card:master', {engine: 'webSpeech'})).toBe(
            true,
        );
        expect(speechSnapshot().listeningTargetId).toBe('marine.coral.browse/card:master');

        vi.advanceTimersByTime(4000);
        expect(speechSnapshot().listeningTargetId).toBeNull();
        // The person stopped talking; that is not a microphone that failed.
        expect(speechSnapshot().error).toBeUndefined();
    });

    test('a phrase reported as the box closes does not light it again', async () => {
        vi.useFakeTimers();
        installSpeechEnvironment({
            recognition: recognitionConstructor,
            silenceMs: 4000,
            startGraceMs: 4000,
        });
        expect(await speechListen('marine.coral.browse/card:master', {engine: 'webSpeech'})).toBe(
            true,
        );

        vi.advanceTimersByTime(4000);
        expect(speechSnapshot().listeningTargetId).toBeNull();

        // A recogniser reports what it heard a moment after being stopped. A box
        // that came back to life here would be claiming a microphone that is shut
        // (`D-766`).
        lastRecognition().hear('late words');
        expect(speechSnapshot().listeningTargetId).toBeNull();
        expect(speechSnapshot().interimText).toBe('');
    });

    test('a pause keeps the phrase it had already recognised', async () => {
        vi.useFakeTimers();
        installSpeechEnvironment({recognition: recognitionConstructor, silenceMs: 4000});
        const heard: Array<[string, string]> = [];
        expect(
            await speechListen(
                'marine.coral.browse/card:master',
                {engine: 'webSpeech'},
                {onText: (id, text) => heard.push([id, text])},
            ),
        ).toBe(true);

        lastRecognition().hear('общата сума е грешна');
        expect(speechSnapshot().interimText).toBe('общата сума е грешна');

        // The engine never finished the phrase. The pause is what ends it, and the
        // words on screen are the words the person meant, so they are kept rather
        // than dropped with the session (`D-771`).
        vi.advanceTimersByTime(4000);
        expect(heard).toEqual([['marine.coral.browse/card:master', 'общата сума е грешна']]);
        expect(speechSnapshot().listeningTargetId).toBeNull();
        expect(speechSnapshot().interimText).toBe('');
    });

    test('the microphone button keeps the phrase too', async () => {
        vi.stubGlobal('webkitSpeechRecognition', recognitionConstructor);
        const heard: Array<[string, string]> = [];
        expect(
            await speechListen(
                'marine.coral.browse/card:master',
                {engine: 'webSpeech'},
                {onText: (id, text) => heard.push([id, text])},
            ),
        ).toBe(true);

        lastRecognition().hear('the total is wrong');
        speechStop();
        expect(heard).toEqual([['marine.coral.browse/card:master', 'the total is wrong']]);
    });

    test('a slow first result is not mistaken for a pause', async () => {
        vi.useFakeTimers();
        installSpeechEnvironment({
            recognition: recognitionConstructor,
            silenceMs: 4000,
            startGraceMs: 4000,
            firstResultMs: 8000,
        });
        expect(await speechListen('marine.coral.browse/card:master', {engine: 'webSpeech'})).toBe(
            true,
        );
        const instance = lastRecognition();

        vi.advanceTimersByTime(3500);
        // A voice is in the microphone and the first word has not arrived: this is
        // the warm-up that used to close the box in the middle of a sentence
        // (`D-772`).
        instance.onspeechstart?.(new Event('speechstart'));
        vi.advanceTimersByTime(7500);
        expect(speechSnapshot().listeningTargetId).toBe('marine.coral.browse/card:master');

        // Once words are coming back, the pause is the four seconds promised.
        instance.hear('общата');
        vi.advanceTimersByTime(3999);
        expect(speechSnapshot().listeningTargetId).toBe('marine.coral.browse/card:master');
        vi.advanceTimersByTime(1);
        expect(speechSnapshot().listeningTargetId).toBeNull();
    });

    test('says what is in the microphone, and how long it will wait', async () => {
        vi.stubGlobal('webkitSpeechRecognition', recognitionConstructor);
        expect(await speechListen('marine.coral.browse/card:master', {engine: 'webSpeech'})).toBe(
            true,
        );
        const instance = lastRecognition();
        expect(speechSnapshot().level).toBe('silence');
        // A session counts its first wait as soon as it is open.
        expect(speechSnapshot().waitMs).toBe(SPEECH_START_GRACE_MS);

        // A sound that is not a voice is not speech (`D-774`).
        instance.onsoundstart?.(new Event('soundstart'));
        expect(speechSnapshot().level).toBe('sound');

        instance.onspeechstart?.(new Event('speechstart'));
        expect(speechSnapshot().level).toBe('speech');

        instance.onspeechend?.(new Event('speechend'));
        expect(speechSnapshot().level).toBe('sound');

        speechStop();
        expect(speechSnapshot().level).toBe('silence');
    });

    test('the hold keeps the dot from blinking between phrases', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('webkitSpeechRecognition', recognitionConstructor);
        expect(await speechListen('marine.coral.browse/card:master', {engine: 'webSpeech'})).toBe(
            true,
        );
        const instance = lastRecognition();

        instance.onspeechstart?.(new Event('speechstart'));
        instance.onspeechend?.(new Event('speechend'));
        vi.advanceTimersByTime(399);
        expect(speechSnapshot().level).toBe('sound');
        vi.advanceTimersByTime(1);
        expect(speechSnapshot().level).toBe('silence');
    });

    test('a switch pressed while listening starts the box again with the new setting', async () => {
        vi.stubGlobal('webkitSpeechRecognition', recognitionConstructor);
        expect(
            await speechListen(
                'marine.coral.browse/card:master',
                {engine: 'webSpeech'},
                {language: 'bg-BG'},
            ),
        ).toBe(true);
        const first = lastRecognition();
        expect(first.lang).toBe('bg-BG');

        setSpeechPreferences({english: true});
        expect(await speechRestart()).toBe(true);

        // A recogniser reads its language when it starts, so the restart is what
        // makes the switch apply to the person's next phrase (`D-767`).
        expect(lastRecognition()).not.toBe(first);
        expect(lastRecognition().lang).toBe('en-US');
        expect(first.stop).toHaveBeenCalled();
        expect(speechSnapshot().listeningTargetId).toBe('marine.coral.browse/card:master');
    });

    test('restarting nothing is not a start', async () => {
        vi.stubGlobal('webkitSpeechRecognition', recognitionConstructor);
        expect(await speechRestart()).toBe(false);
        expect(FakeRecognition.instances).toHaveLength(0);
    });

    test('an automatic start is off when the suite switched it off', async () => {
        vi.stubGlobal('webkitSpeechRecognition', recognitionConstructor);
        permission('granted');
        expect(
            await speechListen(
                'marine.coral.browse/card:master',
                {engine: 'webSpeech', autoListen: false},
                {auto: true},
            ),
        ).toBe(false);
    });

    test('the button starts and stops, and a second press closes the box', async () => {
        vi.stubGlobal('webkitSpeechRecognition', recognitionConstructor);
        permission('granted');

        expect(await speechToggle('marine.coral.browse/card:master', {engine: 'webSpeech'})).toBe(
            true,
        );
        const instance = lastRecognition();
        expect(await speechToggle('marine.coral.browse/card:master', {engine: 'webSpeech'})).toBe(
            false,
        );
        expect(instance.stop).toHaveBeenCalled();
        expect(speechSnapshot().listeningTargetId).toBeNull();
    });

    test('a refusal reported late stops the box reading as listening', async () => {
        vi.stubGlobal('webkitSpeechRecognition', recognitionConstructor);
        permission('granted');

        expect(await speechListen('marine.coral.browse/card:master', {engine: 'webSpeech'})).toBe(
            true,
        );
        // The recogniser opens, then the browser refuses the microphone: a box
        // left pulsing here would be telling the person something untrue.
        lastRecognition().onerror?.({error: 'not-allowed'});
        expect(speechSnapshot().listeningTargetId).toBeNull();
        expect(speechSnapshot().error).toBe('denied');
    });

    test('a portal that declared no speech block opens nothing', async () => {
        vi.stubGlobal('webkitSpeechRecognition', recognitionConstructor);
        permission('granted');
        expect(await speechListen('marine.coral.browse/card:master', undefined, {auto: true})).toBe(
            false,
        );
        expect(FakeRecognition.instances).toHaveLength(0);
    });

    test('says which of the two engines this browser cannot run', async () => {
        vi.stubGlobal('webkitSpeechRecognition', undefined);
        permission('granted');
        expect(await speechListen('marine.coral.browse/card:master', {engine: 'webSpeech'})).toBe(
            false,
        );
        expect(speechSnapshot().error).toBe('unsupported');
        expect(speechSupported('sherpa')).toBe(false);
    });
});
