/**
 * FeedbackMicButton.tsx — the small switch that turns dictation on and off
 * (`@@D-758`).
 *
 * It sits in the bevel, left of the remove button, and it is the only place a
 * microphone prompt is allowed: an automatic start refuses to ask, so a person who
 * has never dictated to this portal needs this click to be asked at all.
 *
 * Rendered only when the suite configured an engine and this browser can run it —
 * a muted button would be a worse answer than no button, because it would suggest
 * the deployment supports something it does not.
 */

import {useTranslate} from '../hooks/useText.js';
import type {SpeechError} from './useFeedbackSpeech.js';

export interface IFeedbackMicButtonProps {
    /** This box is the one being dictated into. */
    listening: boolean;
    /** Why the last attempt failed, when it did. */
    error?: SpeechError;
    onToggle: () => void;
}

const LABEL = {
    start: 'Dictate this comment',
    stop: 'Stop dictating',
    denied: 'The microphone is blocked for this page',
    failed: 'The microphone could not be opened',
} as const;

export function FeedbackMicButton({listening, error, onToggle}: IFeedbackMicButtonProps) {
    const t = useTranslate();
    const label =
        error === 'denied'
            ? LABEL.denied
            : error === 'failed'
              ? LABEL.failed
              : listening
                ? LABEL.stop
                : LABEL.start;
    const title = t(label) ?? label;

    return (
        <button
            type="button"
            className={`blong-feedback-callout__mic${
                listening ? ' blong-feedback-callout__mic--listening' : ''
            }`}
            // The bevel is the drag handle: a press on this button must not start
            // dragging the box, exactly as the remove button does not.
            onPointerDown={event => event.stopPropagation()}
            onClick={onToggle}
            aria-pressed={listening}
            aria-label={title}
            title={title}
            data-feedback-speech={listening ? 'listening' : 'idle'}
        >
            <i className="pi pi-microphone" />
        </button>
    );
}
