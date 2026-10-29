/**
 * FeedbackOutline.tsx — the ring painted around an addressable element
 * (`@@T-462`).
 *
 * A fixed-position div, never a class on the element itself: activating the mode
 * must not change any layout, and an outline drawn over the page cannot.
 *
 * The badge shows the identifier's readable tail — `clubShortName.label-clubs` —
 * because the tail is what says which thing under the pointer this is; the whole
 * path is the tooltip, for the reader who wants to act on it (`@@T-491`).
 */

import {shortTargetId} from './ids.js';
import type {IFeedbackRect} from './placement.js';

export interface IFeedbackOutlineProps {
    rect: IFeedbackRect;
    /** The element's identifier: its tail is the badge, the whole path the tooltip. */
    targetId: string;
    /** `hover` is the element under the pointer, `item` one that already has a comment. */
    tone: 'hover' | 'item';
}

export function FeedbackOutline({rect, targetId, tone}: IFeedbackOutlineProps) {
    const badge = shortTargetId(targetId);
    return (
        <div
            className={`blong-feedback-ring blong-feedback-ring--${tone}`}
            style={{left: rect.x, top: rect.y, width: rect.width, height: rect.height}}
            aria-hidden
        >
            {badge && (
                <span
                    className="blong-feedback-ring__badge"
                    title={targetId}
                >
                    {badge}
                </span>
            )}
        </div>
    );
}
