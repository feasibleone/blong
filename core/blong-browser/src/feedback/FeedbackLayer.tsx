/**
 * FeedbackLayer.tsx — the mode's overlay (`@@T-462`, `@@T-489`, `@@T-490`).
 *
 * Mounted once by `App`, above the portal. It owns everything that is transient:
 * what the pointer is over, where each callout sits, the region the picture will
 * keep, and the one submit that leaves the mode. The draft itself lives in the
 * store, because the elements that can be commented on are scattered through the
 * tree and must not know about a layer.
 *
 * Callout boxes are local state rather than draft fields: they are viewport
 * pixels while the person is arranging them, and become fractions of the capture
 * region only at submit — the moment the region is known.
 */

import type {IFeedbackItem} from '@feasibleone/blong';
import {useCallback, useEffect, useRef, useState} from 'react';

import {useBlong} from '../context/BlongContext.js';
import {useTranslate} from '../hooks/useText.js';
import {useAppStore} from '../state/appStore.js';
import {captureScreen} from './capture.js';
import './feedback.css';
import {FeedbackCallout} from './FeedbackCallout.js';
import {FeedbackCrop} from './FeedbackCrop.js';
import {FeedbackOutline} from './FeedbackOutline.js';
import {FeedbackSubmitBar} from './FeedbackSubmitBar.js';
import {installFeedbackGuard} from './guard.js';
import {closestFeedbackTarget, FEEDBACK_ID_ATTR, isFeedbackUi, rectOf, targetOf} from './ids.js';
import {
    arrowHeadPoints,
    connectorOf,
    moveBox,
    placeCallout,
    resizeBox,
    toFraction,
    type IFeedbackRect,
} from './placement.js';
import {useFeedbackConfig} from './useFeedbackConfig.js';

/** The size a new callout starts at; the person is free to change it. */
// Small on purpose: a callout that covers the element it is about hides the
// problem from the person looking at it (`@@T-494`). A person who wants more room
// drags the corner.
const CALLOUT_SIZE = {width: 212, height: 128};

/** The distance a new callout keeps from its element, so the arrow has a length. */
const CALLOUT_GAP = 22;

function escapeId(id: string): string {
    const css = globalThis.CSS as typeof CSS | undefined;
    return css?.escape ? css.escape(id) : id.replace(/["\\]/g, '\\$&');
}

function sameRect(a: IFeedbackRect | undefined, b: IFeedbackRect | undefined): boolean {
    if (!a || !b) return a === b;
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function viewportOf(): {width: number; height: number} {
    return {width: window.innerWidth, height: window.innerHeight};
}

/** The whole viewport, which is the region a submission keeps unless told otherwise. */
function fullRegion(): IFeedbackRect {
    const {width, height} = viewportOf();
    return {x: 0, y: 0, width, height};
}

/** The first three segments of an identifier: subject, object and page. */
function pageOf(targetId: string): {subject?: string; object?: string; kind?: string} {
    const [subject, object, kind] = targetId.split('/')[0].split('.');
    return {subject, object, kind};
}

/**
 * The region a fresh crop starts from: everything the submission talks about.
 *
 * Anchors alone are not enough — a callout can sit far from the element it is
 * about, and a crop that leaves it outside the picture would store a box the
 * reviewer cannot see. A floor of 40 % of the viewport keeps the first crop
 * usable instead of a sliver around one small element.
 */
function initialCrop(
    rects: Record<string, IFeedbackRect>,
    boxes: Record<string, IFeedbackRect>,
): IFeedbackRect {
    const {width, height} = viewportOf();
    const boxed = [...Object.values(rects), ...Object.values(boxes)];
    if (!boxed.length) {
        return {x: width * 0.1, y: height * 0.1, width: width * 0.8, height: height * 0.8};
    }
    const pad = 32;
    const left = Math.min(...boxed.map(box => box.x)) - pad;
    const top = Math.min(...boxed.map(box => box.y)) - pad;
    const right = Math.max(...boxed.map(box => box.x + box.width)) + pad;
    const bottom = Math.max(...boxed.map(box => box.y + box.height)) + pad;
    const centreX = (left + right) / 2;
    const centreY = (top + bottom) / 2;
    const cropWidth = Math.max(right - left, width * 0.4);
    const cropHeight = Math.max(bottom - top, height * 0.4);
    const x = Math.min(Math.max(0, centreX - cropWidth / 2), Math.max(0, width - cropWidth));
    const y = Math.min(Math.max(0, centreY - cropHeight / 2), Math.max(0, height - cropHeight));
    return {
        x,
        y,
        width: Math.min(cropWidth, width),
        height: Math.min(cropHeight, height),
    };
}

export function FeedbackLayer() {
    const active = useAppStore(state => state.feedback.active);
    const items = useAppStore(state => state.feedback.items);
    const feedbackConfig = useFeedbackConfig();
    const add = useAppStore(state => state.feedbackAdd);
    const update = useAppStore(state => state.feedbackUpdate);
    const remove = useAppStore(state => state.feedbackRemove);
    const reset = useAppStore(state => state.feedbackReset);
    const activate = useAppStore(state => state.feedbackActivate);
    const {handler} = useBlong();
    const t = useTranslate();

    const [hovered, setHovered] = useState<{
        id: string;
        rect: IFeedbackRect;
    } | null>(null);
    const [rects, setRects] = useState<Record<string, IFeedbackRect>>({});
    const [boxes, setBoxes] = useState<Record<string, IFeedbackRect>>({});
    const [cropping, setCropping] = useState(false);
    const [crop, setCrop] = useState<IFeedbackRect | null>(null);
    const [busy, setBusy] = useState(false);

    // The measure pass reads the draft from a ref so it is not re-created (and the
    // scroll listener re-bound) on every keystroke.
    const itemsRef = useRef(items);
    itemsRef.current = items;

    const measure = useCallback(() => {
        const next: Record<string, IFeedbackRect> = {};
        for (const id of Object.keys(itemsRef.current)) {
            const element = document.querySelector(`[${FEEDBACK_ID_ATTR}="${escapeId(id)}"]`);
            if (element) next[id] = rectOf(element);
        }
        // The measurement is the state: the boxes cannot be drawn before the DOM
        // has reported where the elements are, so this is not a render that could
        // be derived earlier (`@@T-489`).
        // eslint-disable-next-line @eslint-react/set-state-in-effect
        setRects(previous => {
            const keys = Object.keys(next);
            if (
                keys.length === Object.keys(previous).length &&
                keys.every(key => sameRect(previous[key], next[key]))
            ) {
                return previous;
            }
            return next;
        });
    }, []);

    // Re-measure when the draft changes and whenever the page moves underneath it:
    // a tab switch, a table paging, a card collapsing. `ResizeObserver` on the body
    // catches the last three, the scroll listener the first two.
    useEffect(() => {
        if (!active) return;
        measure();
        const onMove = () => measure();
        window.addEventListener('scroll', onMove, true);
        window.addEventListener('resize', onMove);
        const observer =
            typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(onMove);
        observer?.observe(document.body);
        return () => {
            window.removeEventListener('scroll', onMove, true);
            window.removeEventListener('resize', onMove);
            observer?.disconnect();
        };
    }, [active, items, measure]);

    // A new comment gets a box from the solver; an existing one keeps the box the
    // person gave it, and a removed comment takes its box with it.
    useEffect(() => {
        if (!active) return;
        // Placement depends on where the anchors were measured, which is a DOM fact
        // rather than a value the render can compute (`@@T-489`).
        // eslint-disable-next-line @eslint-react/set-state-in-effect
        setBoxes(previous => {
            const next: Record<string, IFeedbackRect> = {};
            const taken: IFeedbackRect[] = [];
            let changed = false;
            for (const id of Object.keys(items)) {
                const kept = previous[id];
                if (kept) {
                    next[id] = kept;
                    taken.push(kept);
                    continue;
                }
                const anchor = rects[id];
                if (!anchor) continue;
                next[id] = placeCallout({
                    anchor,
                    size: CALLOUT_SIZE,
                    viewport: viewportOf(),
                    taken,
                    // Room for the arrow to read as one: a box touching its
                    // element leaves the connector no length at all (`@@T-489`).
                    gap: CALLOUT_GAP,
                }).rect;
                taken.push(next[id]);
                changed = true;
            }
            if (Object.keys(previous).length !== Object.keys(next).length) changed = true;
            return changed ? next : previous;
        });
    }, [active, items, rects]);

    // Track the pointer. Hover is the only thing that repaints per move; the
    // outlines for committed comments come from the measured rects.
    useEffect(() => {
        if (!active || cropping) return;
        const onPointerMove = (event: PointerEvent) => {
            if (isFeedbackUi(event.target)) {
                setHovered(null);
                return;
            }
            const element = closestFeedbackTarget(event.target);
            const target = element ? targetOf(element) : null;
            if (!element || !target) {
                setHovered(null);
                return;
            }
            const rect = rectOf(element);
            setHovered(previous =>
                previous && previous.id === target.targetId && sameRect(previous.rect, rect)
                    ? previous
                    : {id: target.targetId, rect},
            );
        };
        document.addEventListener('pointermove', onPointerMove, true);
        return () => document.removeEventListener('pointermove', onPointerMove, true);
    }, [active, cropping]);

    // Freeze the UI and turn a click on an addressable element into a draft item.
    useEffect(() => {
        if (!active || cropping) return;
        return installFeedbackGuard({
            onTargetClick: element => {
                const target = targetOf(element);
                if (!target) return;
                const state = useAppStore.getState();
                const existing = state.feedback.items[target.targetId];
                add({
                    ...target,
                    commentText: existing?.commentText ?? '',
                    itemIndex: existing?.itemIndex ?? Object.keys(state.feedback.items).length,
                } satisfies IFeedbackItem);
            },
        });
    }, [active, cropping, add]);

    const onSubmit = useCallback(async () => {
        const state = useAppStore.getState();
        const comments = Object.values(state.feedback.items).filter(item =>
            (item.commentText ?? '').trim(),
        );
        if (!comments.length) return;
        const method = feedbackConfig?.submit ?? 'feedback.session.add';
        const first = pageOf(comments[0].targetId);
        // Both boxes become fractions of what the picture will keep, so the review
        // page can lay them over that picture without a scale factor.
        const region = crop ?? fullRegion();
        const payload = comments.map(item => ({
            ...item,
            ...(rects[item.targetId] && {anchor: toFraction(rects[item.targetId], region)}),
            ...(boxes[item.targetId] && {callout: toFraction(boxes[item.targetId], region)}),
        }));
        setBusy(true);
        try {
            const outcome = await captureScreen(feedbackConfig?.maxShotBytes, crop ?? undefined);
            await handler[method]?.(
                {
                    session: {
                        pageUrl: `${window.location.pathname}${window.location.search}`,
                        pageTitle: document.title,
                        pageSubject: first.subject,
                        pageObject: first.object,
                        pageKind: first.kind,
                        languageCode: state.language,
                        viewportJSON: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio || 1}`,
                        shotStatus: outcome.status,
                        items: payload,
                        ...(outcome.shot && {shot: outcome.shot}),
                    },
                },
                {},
            );
            reset();
            setBoxes({});
            setCrop(null);
            setCropping(false);
            activate(false);
            state.showToast({
                severity: 'success',
                summary: t('Feedback submitted') ?? 'Feedback submitted',
            });
        } catch {
            // The handler proxy already raised the error dialog; staying in the
            // mode with the draft intact is the recovery the person needs.
        } finally {
            setBusy(false);
        }
    }, [activate, boxes, crop, feedbackConfig, handler, rects, reset, t]);

    const onCrop = useCallback(() => {
        setCropping(previous => {
            if (previous) return false;
            setCrop(current => current ?? initialCrop(rects, boxes));
            return true;
        });
    }, [boxes, rects]);

    const onDiscard = useCallback(() => {
        reset();
        setBoxes({});
        setCrop(null);
        setCropping(false);
    }, [reset]);

    if (!active) return null;

    const connectors = Object.keys(items)
        .filter(id => rects[id] && boxes[id])
        .map(id => ({id, ...connectorOf(boxes[id], rects[id])}));

    return (
        <div className="blong-feedback-layer">
            {!cropping && hovered && (
                <FeedbackOutline
                    rect={hovered.rect}
                    targetId={hovered.id}
                    tone="hover"
                />
            )}
            {!cropping &&
                Object.keys(items).map(id =>
                    rects[id] ? (
                        <FeedbackOutline
                            key={`ring-${id}`}
                            rect={rects[id]}
                            targetId={id}
                            tone="item"
                        />
                    ) : null,
                )}
            {!cropping && connectors.length > 0 && (
                <svg
                    className="blong-feedback-connectors"
                    aria-hidden
                >
                    {connectors.map(({id, from, to}) => (
                        <g key={`line-${id}`}>
                            <line
                                className="blong-feedback-connector"
                                x1={from.x}
                                y1={from.y}
                                x2={to.x}
                                y2={to.y}
                            />
                            <polygon
                                className="blong-feedback-connector__head"
                                points={arrowHeadPoints(from, to)}
                            />
                        </g>
                    ))}
                </svg>
            )}
            {!cropping &&
                Object.entries(items).map(([id, item]) => {
                    const box = boxes[id];
                    if (!box) return null;
                    return (
                        <FeedbackCallout
                            key={`callout-${id}`}
                            targetId={id}
                            box={box}
                            comment={item.commentText ?? ''}
                            onChange={value => update(id, {commentText: value})}
                            onRemove={() => remove(id)}
                            onMove={(dx, dy) =>
                                setBoxes(previous => ({
                                    ...previous,
                                    [id]: moveBox(previous[id] ?? box, dx, dy, viewportOf()),
                                }))
                            }
                            onResize={(dx, dy) =>
                                setBoxes(previous => ({
                                    ...previous,
                                    [id]: resizeBox(previous[id] ?? box, dx, dy, viewportOf()),
                                }))
                            }
                        />
                    );
                })}
            {cropping && crop && (
                <FeedbackCrop
                    region={crop}
                    onMove={(dx, dy) =>
                        setCrop(previous =>
                            previous ? moveBox(previous, dx, dy, viewportOf()) : previous,
                        )
                    }
                    onResize={(dx, dy) =>
                        setCrop(previous =>
                            previous ? resizeBox(previous, dx, dy, viewportOf()) : previous,
                        )
                    }
                />
            )}
            <FeedbackSubmitBar
                count={Object.keys(items).length}
                busy={busy}
                cropping={cropping}
                cropped={Boolean(crop)}
                onCrop={onCrop}
                onSubmit={() => void onSubmit()}
                onDiscard={onDiscard}
            />
        </div>
    );
}
