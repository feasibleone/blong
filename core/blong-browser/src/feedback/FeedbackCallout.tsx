/**
 * FeedbackCallout.tsx — one comment box, tied to its element (`@@T-462`,
 * `@@T-489`).
 *
 * The solver decides where a new box goes; after that the box belongs to the
 * person. The top bevel is the handle — thicker for that reason, thinner at the
 * bottom so the box reads as a note rather than a dialog — and the bottom-right
 * corner resizes. There is no identifier line inside: the bevel carries the
 * readable tail of the identifier as a tooltip, and the layer draws the line back
 * to the element, which is what actually tells the reader what the box is about.
 *
 * Dictation adds two pieces of chrome (`D-763` `D-764`). The phrase still being
 * recognised sits under the text with a pair of small buttons, so a person can
 * keep it or drop it before the engine finishes it; and a row of pills under that
 * says how the next phrase will be recognised — on this device, punctuated, in
 * English over the portal's language.
 *
 * `data-feedback-ui` marks it as the mode's own chrome: the guard lets its events
 * through, and the screenshot hides it.
 */

import {useTranslate} from '../hooks/useText.js';
import type {FeedbackSpeechEngine} from '../types/portal.js';
import {FeedbackMicButton} from './FeedbackMicButton.js';
import {FEEDBACK_UI_ATTR, shortTargetId} from './ids.js';
import type {IFeedbackRect} from './placement.js';
import {localSpeechAvailable, type SpeechLevel} from './speech.js';
import {useDrag} from './useDrag.js';
import {useSpeechPreferences, type SpeechError} from './useFeedbackSpeech.js';

export interface IFeedbackCalloutProps {
    /** The element's identifier, shown as a tooltip and in the bevel. */
    targetId: string;
    box: IFeedbackRect;
    comment: string;
    onChange: (value: string) => void;
    onRemove: () => void;
    /** Pointer delta since the last frame, in CSS pixels. */
    onMove: (dx: number, dy: number) => void;
    onResize: (dx: number, dy: number) => void;
    /** Dictation is available in this portal and in this browser (`@@D-758`). */
    speechAvailable?: boolean;
    /** This box is the one being dictated into. */
    listening?: boolean;
    /** The phrase the engine is still recognising. */
    interimText?: string;
    /** What is in the microphone: a voice, another sound, or a room (`D-774`). */
    level?: SpeechLevel;
    /** The wait the engine is counting down, in milliseconds (`D-775`). */
    waitMs?: number;
    /** How many times that wait has started again, which restarts the bar with it. */
    idle?: number;
    /** Why the last attempt to listen failed. */
    speechError?: SpeechError;
    /**
     * The person pointed at this box: start listening unless nothing is granted.
     *
     * Focus is the signal rather than a click, because a click that lands on the
     * text area focuses it anyway — one path, and it also covers a tab.
     */
    onListen?: () => void;
    onToggleListen?: () => void;
    /** Keep the phrase still being recognised (`D-764`). */
    onAcceptInterim?: () => void;
    /** Drop the phrase still being recognised (`D-764`). */
    onClearInterim?: () => void;
    /** The engine this portal dictates through; the pills depend on it (`D-763`). */
    speechEngine?: FeedbackSpeechEngine;
}

/** The pills under the interim text, and what each one switches (`D-763`). */
const PILL_LABEL = {
    onDevice: 'Local',
    punctuation: 'Punctuation',
    english: 'English',
} as const;

const PILL_TITLE = {
    onDevice: 'Recognise on this device',
    punctuation: 'Write the punctuation I do not say',
    english: 'Dictate in English',
} as const;

export function FeedbackCallout({
    targetId,
    box,
    comment,
    onChange,
    onRemove,
    onMove,
    onResize,
    speechAvailable = false,
    listening = false,
    interimText,
    level = 'silence',
    waitMs = 0,
    idle = 0,
    speechError,
    onListen,
    onToggleListen,
    onAcceptInterim,
    onClearInterim,
    speechEngine,
}: IFeedbackCalloutProps) {
    const t = useTranslate();
    const {preferences, setPreference} = useSpeechPreferences();

    // Deltas are taken from the last pointer position rather than the grab point,
    // so the box follows the pointer even when a clamp stopped it for a moment.
    const move = useDrag(onMove);
    const resize = useDrag(onResize);

    // A model that runs in the page is always local, and a fixed model cannot be
    // talked out of its language: the two pills say nothing there, so they are not
    // drawn (`D-763`).
    const sherpa = speechEngine === 'sherpa';
    const showLocal = !sherpa && localSpeechAvailable();
    const showEnglish = !sherpa;
    const interim = interimText?.trim() ?? '';
    const keepTitle = t('Keep this phrase') ?? 'Keep this phrase';
    const dropTitle = t('Drop this phrase') ?? 'Drop this phrase';

    return (
        <div
            className={`blong-feedback-callout${
                listening ? ' blong-feedback-callout--listening' : ''
            }`}
            style={{left: box.x, top: box.y, width: box.width, height: box.height}}
            {...{[FEEDBACK_UI_ATTR]: 'callout'}}
            // The identifier the box is about, so a story or a test can take hold of
            // one box rather than the nth one (`@@T-498`).
            data-feedback-target={targetId}
        >
            <div
                className="blong-feedback-callout__bevel"
                onPointerDown={move.start}
            >
                <span
                    className="blong-feedback-callout__handle"
                    title={targetId}
                >
                    {shortTargetId(targetId)}
                </span>
                {speechAvailable && (
                    <FeedbackMicButton
                        listening={listening}
                        error={speechError}
                        onToggle={() => onToggleListen?.()}
                    />
                )}
                <button
                    type="button"
                    className="blong-feedback-callout__remove"
                    onPointerDown={event => event.stopPropagation()}
                    onClick={onRemove}
                    title={t('Remove this comment') ?? 'Remove this comment'}
                    aria-label={t('Remove this comment') ?? 'Remove this comment'}
                >
                    <i className="pi pi-times" />
                </button>
            </div>
            <textarea
                className="blong-feedback-callout__text"
                value={comment}
                placeholder={t('What is wrong here?') ?? 'What is wrong here?'}
                onChange={event => onChange(event.target.value)}
                onFocus={() => onListen?.()}
            />
            {listening && (
                // The caption, not the text area: what the engine has not
                // finished hearing is drawn apart from what the person owns, so a
                // refinement cannot overwrite a word they typed (`@@D-758`).
                // It grows with the phrase, and the two buttons settle it before
                // the engine does (`D-764`).
                <div
                    className="blong-feedback-callout__interim"
                    data-feedback-interim
                    data-feedback-hearing={level !== 'silence' ? 'true' : 'false'}
                    data-feedback-level={level}
                >
                    {/* A voice is in the microphone, words or not (`D-774`): the
                        wait between speaking and a first transcription is the
                        longest part of dictating, and a dot that answers the room
                        is what makes it a wait rather than a fault. It says which
                        of the two it is, because a fan is not a voice. */}
                    <span
                        className={`blong-feedback-callout__dot blong-feedback-callout__dot--${level}`}
                        aria-hidden
                    />
                    <span
                        className="blong-feedback-callout__interimText"
                        aria-live="polite"
                    >
                        {interim || t('Listening…') || 'Listening…'}
                    </span>
                    <span className="blong-feedback-callout__interimActions">
                        <button
                            type="button"
                            className="blong-feedback-callout__interimAction"
                            onPointerDown={event => event.stopPropagation()}
                            onClick={onAcceptInterim}
                            disabled={!interim}
                            title={keepTitle}
                            aria-label={keepTitle}
                            data-feedback-interim-take
                        >
                            <i className="pi pi-check" />
                        </button>
                        <button
                            type="button"
                            className="blong-feedback-callout__interimAction"
                            onPointerDown={event => event.stopPropagation()}
                            onClick={onClearInterim}
                            disabled={!interim}
                            title={dropTitle}
                            aria-label={dropTitle}
                            data-feedback-interim-drop
                        >
                            <i className="pi pi-times" />
                        </button>
                    </span>
                    {/* The wait the engine is counting down (`D-775`). It is drawn
                        from the top again every time a result restarts the clock,
                        which is why the key is the count: React remounts the bar
                        and the animation starts over. */}
                    {waitMs > 0 && (
                        <span
                            key={idle}
                            className="blong-feedback-callout__drain"
                            style={{animationDuration: `${waitMs}ms`}}
                            aria-hidden
                        />
                    )}
                </div>
            )}
            {speechAvailable && (
                <div
                    className="blong-feedback-callout__pills"
                    role="group"
                    aria-label={
                        t('How to recognise this comment') ?? 'How to recognise this comment'
                    }
                >
                    {showLocal && (
                        <button
                            type="button"
                            className="blong-feedback-callout__pill"
                            onPointerDown={event => event.stopPropagation()}
                            onClick={() => setPreference({onDevice: !preferences.onDevice})}
                            aria-pressed={preferences.onDevice}
                            title={t(PILL_TITLE.onDevice) ?? PILL_TITLE.onDevice}
                            data-feedback-speech-pill="onDevice"
                        >
                            {t(PILL_LABEL.onDevice) ?? PILL_LABEL.onDevice}
                        </button>
                    )}
                    <button
                        type="button"
                        className="blong-feedback-callout__pill"
                        onPointerDown={event => event.stopPropagation()}
                        onClick={() => setPreference({punctuation: !preferences.punctuation})}
                        aria-pressed={preferences.punctuation}
                        title={t(PILL_TITLE.punctuation) ?? PILL_TITLE.punctuation}
                        data-feedback-speech-pill="punctuation"
                    >
                        {t(PILL_LABEL.punctuation) ?? PILL_LABEL.punctuation}
                    </button>
                    {showEnglish && (
                        <button
                            type="button"
                            className="blong-feedback-callout__pill"
                            onPointerDown={event => event.stopPropagation()}
                            onClick={() => setPreference({english: !preferences.english})}
                            aria-pressed={preferences.english}
                            title={t(PILL_TITLE.english) ?? PILL_TITLE.english}
                            data-feedback-speech-pill="english"
                        >
                            {t(PILL_LABEL.english) ?? PILL_LABEL.english}
                        </button>
                    )}
                </div>
            )}
            <span
                className="blong-feedback-callout__resize"
                onPointerDown={resize.start}
                aria-hidden
            />
        </div>
    );
}
