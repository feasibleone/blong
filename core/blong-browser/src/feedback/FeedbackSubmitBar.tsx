/**
 * FeedbackSubmitBar.tsx — the mode's whole workflow in three buttons
 * (`@@T-462`, `@@T-490`).
 *
 * It reports how many comments are waiting, opens the crop, and takes the one
 * action that leaves the mode: submit. Discarding keeps the mode open (the draft
 * is only dropped after the confirmation the caller decides on).
 */

import {Text} from '../components/Text/Text.js';
import {FEEDBACK_UI_ATTR} from './ids.js';

export interface IFeedbackSubmitBarProps {
    count: number;
    busy: boolean;
    /** While cropping, the label asks to finish rather than to start. */
    cropping: boolean;
    /** Whether a region is already chosen, so the button reads as an edit. */
    cropped: boolean;
    onCrop: () => void;
    onSubmit: () => void;
    onDiscard: () => void;
}

export function FeedbackSubmitBar({
    count,
    busy,
    cropping,
    cropped,
    onCrop,
    onSubmit,
    onDiscard,
}: IFeedbackSubmitBarProps) {
    return (
        <div
            className="blong-feedback-bar"
            {...{[FEEDBACK_UI_ATTR]: 'bar'}}
        >
            <span className="blong-feedback-bar__count">
                {count === 1 ? (
                    <Text>1 comment</Text>
                ) : (
                    <Text params={{count}}>{'{count} comments'}</Text>
                )}
            </span>
            <button
                type="button"
                className="blong-feedback-bar__button"
                onClick={onCrop}
                disabled={busy}
                aria-pressed={cropping}
            >
                {cropping ? (
                    <Text>Done</Text>
                ) : cropped ? (
                    <Text>Edit picture</Text>
                ) : (
                    <Text>Crop</Text>
                )}
            </button>
            <button
                type="button"
                className="blong-feedback-bar__button"
                onClick={onDiscard}
                disabled={busy}
            >
                <Text>Discard</Text>
            </button>
            <button
                type="button"
                className="blong-feedback-bar__button blong-feedback-bar__button--primary"
                onClick={onSubmit}
                disabled={busy || count === 0 || cropping}
            >
                {busy ? <i className="pi pi-spin pi-spinner" /> : <Text>Submit</Text>}
            </button>
        </div>
    );
}
