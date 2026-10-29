/**
 * placement.ts — where a callout goes (`@@T-462`).
 *
 * Pure geometry, so the awkward part of the feature can be unit-tested without a
 * browser: given the anchor's rectangle, the callout's size, the viewport and the
 * callouts already placed, answer with a rectangle and the side it hung off.
 *
 * The rule is: right, below, left, above in that order, and the first candidate
 * that fits wins; among candidates that do not fit, the one covering the least of
 * what is already there wins (and covering the anchor itself counts as damage, so
 * a callout never hides the thing it is about).
 */

export interface IFeedbackRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface IPlacementSize {
    width: number;
    height: number;
}

export type IFeedbackSide = 'right' | 'below' | 'left' | 'above';

export interface IPlacement {
    rect: IFeedbackRect;
    side: IFeedbackSide;
}

export interface IPlacementInput {
    anchor: IFeedbackRect;
    size: IPlacementSize;
    viewport: {width: number; height: number};
    /** Callouts already placed, in the order they were solved. */
    taken?: IFeedbackRect[];
    /** Distance between the anchor and the callout; default 8. */
    gap?: number;
}

/** The area two rectangles share; 0 when they do not touch. */
export function overlapArea(a: IFeedbackRect, b: IFeedbackRect): number {
    const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return width > 0 && height > 0 ? width * height : 0;
}

function clamp(value: number, min: number, max: number): number {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
}

/** The four candidates, before clamping, in preference order. */
function candidates(
    anchor: IFeedbackRect,
    size: IPlacementSize,
    gap: number,
): Array<{side: IFeedbackSide; x: number; y: number}> {
    return [
        {side: 'right', x: anchor.x + anchor.width + gap, y: anchor.y},
        {side: 'below', x: anchor.x, y: anchor.y + anchor.height + gap},
        {side: 'left', x: anchor.x - size.width - gap, y: anchor.y},
        {side: 'above', x: anchor.x, y: anchor.y - size.height - gap},
    ];
}

/**
 * Place one callout.
 *
 * Each candidate is clamped into the viewport and scored: how much of it lands on
 * a callout already there, how much on the anchor, and how far it had to be moved
 * to fit at all. An unmoved candidate scores zero, so a side that mounts cleanly
 * always beats a side that had to be pushed.
 */
export function placeCallout({
    anchor,
    size,
    viewport,
    taken = [],
    gap = 8,
}: IPlacementInput): IPlacement {
    let best: {score: number; rect: IFeedbackRect; side: IFeedbackSide} | undefined;

    for (const [index, candidate] of candidates(anchor, size, gap).entries()) {
        const rect: IFeedbackRect = {
            x: clamp(candidate.x, 0, viewport.width - size.width),
            y: clamp(candidate.y, 0, viewport.height - size.height),
            width: size.width,
            height: size.height,
        };
        const moved = Math.abs(rect.x - candidate.x) + Math.abs(rect.y - candidate.y);
        const damage = taken.reduce((total, other) => total + overlapArea(rect, other), 0);
        // Covering the anchor is worse than covering another callout: a reader has
        // to see what the box is about.
        const covering = overlapArea(rect, anchor) * 2;
        // The index is a tie-breaker that keeps the stated preference order.
        const score = damage + covering + moved + index / 100;
        if (!best || score < best.score) best = {score, rect, side: candidate.side};
    }

    return {rect: best!.rect, side: best!.side};
}

/** Solve several callouts at once, in order, each avoiding the ones before it. */
export function placeCallouts(
    anchors: Array<{key: string; anchor: IFeedbackRect}>,
    size: IPlacementSize,
    viewport: {width: number; height: number},
): Record<string, IPlacement> {
    const placed: Record<string, IPlacement> = {};
    const taken: IFeedbackRect[] = [];
    for (const {key, anchor} of anchors) {
        const placement = placeCallout({anchor, size, viewport, taken});
        placed[key] = placement;
        taken.push(placement.rect);
    }
    return placed;
}

// ── Dragging, resizing, and the line back to the element (`@@T-489`) ───────

function centre(rect: IFeedbackRect): {x: number; y: number} {
    return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
}

/** Where the ray from `rect`'s centre towards `target` leaves `rect`. */
function borderPoint(
    rect: IFeedbackRect,
    target: {x: number; y: number},
    ring: number,
): {x: number; y: number} {
    const from = centre(rect);
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    if (!dx && !dy) return from;
    const alongX = dx ? (rect.width + ring) / 2 / Math.abs(dx) : Number.POSITIVE_INFINITY;
    const alongY = dy ? (rect.height + ring) / 2 / Math.abs(dy) : Number.POSITIVE_INFINITY;
    const scale = Math.min(alongX, alongY);
    return {x: from.x + dx * scale, y: from.y + dy * scale};
}

/**
 * The line a callout draws back to the element it is about.
 *
 * Both ends sit on a border rather than a centre, so the line never runs under the
 * callout's own text and the arrowhead lands exactly on the ring the element
 * carries. The two centres decide the direction, which keeps the result stable
 * while a box is dragged.
 */
export function connectorOf(
    callout: IFeedbackRect,
    anchor: IFeedbackRect,
): {from: {x: number; y: number}; to: {x: number; y: number}} {
    return {
        from: borderPoint(callout, centre(anchor), 0),
        to: borderPoint(anchor, centre(callout), 4),
    };
}

/** The smallest box a person may resize a callout to. */
export const MIN_CALLOUT = {width: 200, height: 120};

/** A box moved by a pointer delta and kept inside the viewport. */
export function moveBox(
    box: IFeedbackRect,
    dx: number,
    dy: number,
    viewport: {width: number; height: number},
): IFeedbackRect {
    return {
        ...box,
        x: clamp(box.x + dx, 0, viewport.width - box.width),
        y: clamp(box.y + dy, 0, viewport.height - box.height),
    };
}

/** A box resized from its bottom-right corner, never below `MIN_CALLOUT`. */
export function resizeBox(
    box: IFeedbackRect,
    dx: number,
    dy: number,
    viewport: {width: number; height: number},
): IFeedbackRect {
    return {
        ...box,
        width: clamp(box.width + dx, MIN_CALLOUT.width, viewport.width - box.x),
        height: clamp(box.height + dy, MIN_CALLOUT.height, viewport.height - box.y),
    };
}

/** A rectangle as a fraction of a region, so a stored box survives a resize. */
export function toFraction(rect: IFeedbackRect, region: IFeedbackRect): IFeedbackRect {
    const round = (value: number) => Math.round(value * 10_000) / 10_000;
    const left = clamp(rect.x, region.x, region.x + region.width);
    const top = clamp(rect.y, region.y, region.y + region.height);
    // The size is bounded by what is left of the region from where the box starts,
    // not by the whole region: a box against the right edge is narrow, and a
    // fraction above one would draw outside the picture.
    return {
        x: round((left - region.x) / region.width),
        y: round((top - region.y) / region.height),
        width: round(clamp(rect.width, 0, region.x + region.width - left) / region.width),
        height: round(clamp(rect.height, 0, region.y + region.height - top) / region.height),
    };
}

/**
 * The arrowhead at the end of a connector, as an SVG `points` string.
 *
 * The tip sits exactly on the element's border, so the head touches the ring
 * rather than hovering near it, and the triangle is built from the line's own
 * direction so a dragged callout keeps its head pointing the right way.
 */
export function arrowHeadPoints(
    from: {x: number; y: number},
    to: {x: number; y: number},
    size = 10,
): string {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const base = {x: to.x - ux * size, y: to.y - uy * size};
    const half = size * 0.45;
    return [
        `${to.x},${to.y}`,
        `${base.x - uy * half},${base.y + ux * half}`,
        `${base.x + uy * half},${base.y - ux * half}`,
    ].join(' ');
}
