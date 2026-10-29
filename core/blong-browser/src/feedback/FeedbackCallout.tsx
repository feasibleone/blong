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
 * `data-feedback-ui` marks it as the mode's own chrome: the guard lets its events
 * through, and the screenshot hides it.
 */

import {useTranslate} from '../hooks/useText.js';
import {FEEDBACK_UI_ATTR, shortTargetId} from './ids.js';
import type {IFeedbackRect} from './placement.js';
import {useDrag} from './useDrag.js';

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
}

export function FeedbackCallout({
    targetId,
    box,
    comment,
    onChange,
    onRemove,
    onMove,
    onResize,
}: IFeedbackCalloutProps) {
    const t = useTranslate();

    // Deltas are taken from the last pointer position rather than the grab point,
    // so the box follows the pointer even when a clamp stopped it for a moment.
    const move = useDrag(onMove);
    const resize = useDrag(onResize);

    return (
        <div
            className="blong-feedback-callout"
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
            />
            <span
                className="blong-feedback-callout__resize"
                onPointerDown={resize.start}
                aria-hidden
            />
        </div>
    );
}
