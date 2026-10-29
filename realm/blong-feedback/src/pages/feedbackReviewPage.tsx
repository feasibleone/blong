/**
 * feedbackReviewPage.tsx — the administrator's review UI (`@@T-473`).
 *
 * Left: the queue, newest first, filtered by status, one checkbox per row.
 * Right: the picked session — its picture with the callouts drawn over it where
 * the person left them, and the element each one is about outlined beside it.
 * Bottom: the two acts that make up the workflow — render the document for the
 * selection and copy it out, then mark that same selection processed (`@@D-663`).
 *
 * The callouts are the editor (`@@T-495`): a reviewer rewrites the words in the
 * box, drags it, resizes it, and closes the ones that are noise, and every one of
 * those acts is a row update. There is no second list of comment fields beside the
 * picture — a comment belongs where the person put it.
 *
 * There is no saved document anywhere in this page, because there is none to save:
 * the Markdown is what the rows say right now (`@@D-660`).
 */
import type {IFeedbackBox, IFeedbackSession} from '@feasibleone/blong';
import React, {useCallback, useEffect, useRef, useState} from 'react';

import {
    Button,
    Text,
    arrowHeadPoints,
    connectorOf,
    moveBox,
    resizeBox,
    shortTargetId,
    useBlong,
    useFeedbackConfig,
} from '@feasibleone/blong-browser';

interface IQueueRow {
    sessionId: string;
    pageUrl: string;
    pageTitle?: string;
    pageSubject?: string;
    pageObject?: string;
    pageKind?: string;
    languageCode?: string;
    shotStatus: IFeedbackSession['shotStatus'];
    status: IFeedbackSession['status'];
    submittedAt: string;
    itemCount: number;
}

interface IReviewItem {
    feedbackItemId: string;
    targetId: string;
    targetKind: string;
    targetLabel?: string;
    /** The element's rectangle, as fractions of the picture (`@@T-490`). */
    anchor?: IFeedbackBox;
    /** Where the person left the comment box, as fractions of the picture. */
    callout?: IFeedbackBox;
    commentText: string;
    refinedText?: string;
    /** Set when a reviewer closed the comment (`@@T-496`). */
    removedAt?: string;
}

interface IReviewSession extends IQueueRow {
    shotWidth?: number;
    shotHeight?: number;
}

/** The picture's own size, in the pixels it is stored at. */
interface IPicture {
    width: number;
    height: number;
}

/** What an edit of one item may carry. */
interface IItemEdit {
    refinedText?: string;
    callout?: IFeedbackBox;
    removed?: boolean;
}

/** The handler proxy, typed for a two-argument call. */
type ICall = (params: object, meta: object) => Promise<unknown>;

/** The methods, named from `portal.feedback` so a suite can point them elsewhere. */
function useMethods() {
    const config = useFeedbackConfig();
    return {
        list: 'feedback.session.list',
        items: 'feedback.session.items',
        shot: config?.shot ?? 'feedback.shot.get',
        prose: config?.prose ?? 'feedback.prose.render',
        update: config?.update ?? 'feedback.session.update',
        itemEdit: 'feedback.item.edit',
    };
}

export function FeedbackReviewPage() {
    const {handler} = useBlong();
    const call = handler as unknown as Record<string, ICall | undefined>;
    const methods = useMethods();

    const [status, setStatus] = useState<'new' | 'processed' | null>('new');
    const [queue, setQueue] = useState<IQueueRow[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [current, setCurrent] = useState<{session: IReviewSession; items: IReviewItem[]} | null>(
        null,
    );
    const [shot, setShot] = useState<string | null>(null);
    const [picture, setPicture] = useState<IPicture | undefined>();
    const [document, setDocument] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        const result = (await call[methods.list]?.({status}, {})) as
            | {sessions?: IQueueRow[]}
            | undefined;
        setQueue(result?.sessions ?? []);
    }, [call, methods.list, status]);

    useEffect(() => {
        void load();
    }, [load]);

    const open = useCallback(
        async (sessionId: string) => {
            const result = (await call[methods.items]?.({sessionId}, {})) as
                | {session: IReviewSession; items: IReviewItem[]}
                | undefined;
            if (!result) return;
            setCurrent(result);
            setShot(null);
            setPicture(undefined);
            if (result.session.shotStatus === 'captured') {
                const image = (await call[methods.shot]?.({sessionId}, {})) as
                    | {shotData?: string}
                    | undefined;
                setShot(image?.shotData ?? null);
            }
        },
        [call, methods.items, methods.shot],
    );

    /** Write one reviewer act back to the row it belongs to, then to this page. */
    const editItem = useCallback(
        async (item: IReviewItem, patch: IItemEdit) => {
            if (!current) return;
            setCurrent(previous =>
                previous
                    ? {
                          ...previous,
                          items: previous.items.map(row =>
                              row.feedbackItemId === item.feedbackItemId
                                  ? {
                                        ...row,
                                        ...patch,
                                        removedAt:
                                            patch.removed === undefined
                                                ? row.removedAt
                                                : patch.removed
                                                  ? new Date().toISOString()
                                                  : undefined,
                                    }
                                  : row,
                          ),
                      }
                    : previous,
            );
            await call[methods.itemEdit]?.(
                {
                    sessionId: current.session.sessionId,
                    itemId: item.feedbackItemId,
                    ...patch,
                },
                {},
            );
        },
        [call, current, methods.itemEdit],
    );

    const generate = useCallback(async () => {
        setBusy(true);
        try {
            const result = (await call[methods.prose]?.(
                selected.length ? {sessionIds: selected} : {status: status ?? 'new'},
                {},
            )) as {document?: string} | undefined;
            setDocument(result?.document ?? '');
        } finally {
            setBusy(false);
        }
    }, [call, methods.prose, selected, status]);

    const markProcessed = useCallback(async () => {
        if (!selected.length) return;
        setBusy(true);
        try {
            await call[methods.update]?.({sessionIds: selected}, {});
            setSelected([]);
            setDocument('');
            await load();
        } finally {
            setBusy(false);
        }
    }, [call, load, methods.update, selected]);

    const toggle = (sessionId: string) =>
        setSelected(previous =>
            previous.includes(sessionId)
                ? previous.filter(id => id !== sessionId)
                : [...previous, sessionId],
        );

    const openItems = current?.items.filter(item => !item.removedAt) ?? [];
    const closedItems = current?.items.filter(item => item.removedAt) ?? [];

    return (
        <div
            className="flex flex-column gap-2 p-2"
            style={{
                height: '100%',
                minHeight: 0,
                overflow: 'auto',
                // The theme's family, said here as well as inherited: the page is a
                // component a story or a test can mount without the shell, and a body
                // nobody styled falls back to the browser's serif — which is how a page
                // and its own picture ended up in two different typefaces (`@@T-495`).
                fontFamily:
                    'var(--font-family, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif)',
            }}
        >
            <div className="flex align-items-center gap-2">
                <Text
                    as="span"
                    className="font-bold"
                >
                    Feedback
                </Text>
                {(['new', 'processed', null] as const).map(value => (
                    <Button
                        key={String(value)}
                        label={value ?? 'all'}
                        className={status === value ? 'p-button-sm' : 'p-button-sm p-button-text'}
                        onClick={() => {
                            setStatus(value);
                            setSelected([]);
                            setDocument('');
                        }}
                    />
                ))}
                <span className="ml-auto flex gap-2">
                    <Button
                        label="Generate prose"
                        className="p-button-sm"
                        disabled={busy}
                        onClick={() => void generate()}
                    />
                    <Button
                        label="Mark processed"
                        className="p-button-sm"
                        disabled={busy || !selected.length}
                        onClick={() => void markProcessed()}
                    />
                </span>
            </div>

            <div
                className="flex flex-wrap gap-2"
                // `flexShrink: 0` keeps the panes at their own height: a flex item is
                // allowed to shrink below its content, and the picture then painted
                // over the prose panel below it (`@@T-497`).
                style={{flexShrink: 0, minHeight: 0}}
            >
                <div
                    className="border-1 border-300 border-round"
                    // Narrow on purpose: the picture is what the reviewer came for, and
                    // the queue only has to name a page and a moment (`@@T-495`).
                    style={{flex: '0 1 240px', width: 240, minWidth: 0, overflow: 'auto'}}
                >
                    {queue.length === 0 && (
                        <div className="p-2 opacity-70 text-sm">
                            <Text>Nothing to review.</Text>
                        </div>
                    )}
                    {queue.map(row => (
                        <label
                            key={row.sessionId}
                            className="flex align-items-center gap-2 p-2 border-bottom-1 border-300 cursor-pointer"
                        >
                            <input
                                type="checkbox"
                                checked={selected.includes(row.sessionId)}
                                onChange={() => toggle(row.sessionId)}
                            />
                            <span
                                className="flex flex-column"
                                data-feedback-queue-row={row.sessionId}
                                onClick={() => void open(row.sessionId)}
                            >
                                <Text
                                    as="span"
                                    className="text-sm font-bold"
                                >
                                    {`${row.pageSubject ?? 'blong'}.${row.pageObject ?? 'portal'}.${row.pageKind ?? 'page'}`}
                                </Text>
                                <span className="text-xs opacity-70">
                                    {row.submittedAt.slice(0, 16).replace('T', ' ')} ·{' '}
                                    {row.itemCount} item{row.itemCount === 1 ? '' : 's'} ·{' '}
                                    {row.status}
                                </span>
                            </span>
                        </label>
                    ))}
                </div>

                <div
                    className="border-1 border-300 border-round p-2"
                    // No `flex-1` class beside this: PrimeFlex marks its utilities
                    // `!important`, so the class would win over the basis that makes the
                    // two panes wrap into a column on a narrow screen.
                    style={{flex: '1 1 420px', minWidth: 0, overflow: 'auto'}}
                    data-feedback-detail=""
                >
                    {!current && (
                        <div className="opacity-70 text-sm">
                            <Text>Pick a session to see the picture and its comments.</Text>
                        </div>
                    )}
                    {current && (
                        <div className="flex flex-column gap-2">
                            <div className="text-xs opacity-70">
                                {current.session.pageUrl} · {current.session.languageCode} ·{' '}
                                {current.session.shotStatus} · {openItems.length} comment
                                {openItems.length === 1 ? '' : 's'}
                                {closedItems.length ? `, ${closedItems.length} closed` : ''}
                            </div>
                            {shot ? (
                                <div
                                    style={{
                                        position: 'relative',
                                        // The picture is drawn at the size it was taken. A
                                        // small crop blown up to the pane's width reads as
                                        // a zoom nobody asked for, and now that the
                                        // callouts are the editor, a wrong-looking scale is
                                        // a wrong-looking editor (`@@T-495`).
                                        maxWidth: Math.min(1000, picture?.width ?? 1000),
                                    }}
                                >
                                    <img
                                        src={shot}
                                        alt="Captured screen"
                                        onLoad={event =>
                                            setPicture({
                                                width: event.currentTarget.naturalWidth,
                                                height: event.currentTarget.naturalHeight,
                                            })
                                        }
                                        style={{
                                            display: 'block',
                                            width: '100%',
                                            border: '1px solid var(--surface-border, #999)',
                                        }}
                                    />
                                    {picture && (
                                        <>
                                            <Connectors
                                                items={openItems}
                                                picture={picture}
                                            />
                                            {openItems.map(item => (
                                                <AnchorOutline
                                                    key={`anchor-${item.feedbackItemId}`}
                                                    item={item}
                                                />
                                            ))}
                                            {openItems.map(item => (
                                                <ReviewCallout
                                                    key={`callout-${item.feedbackItemId}`}
                                                    item={item}
                                                    picture={picture}
                                                    onEdit={patch => void editItem(item, patch)}
                                                    onClose={() =>
                                                        void editItem(item, {removed: true})
                                                    }
                                                />
                                            ))}
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className="text-sm opacity-70">
                                    <Text>No picture for this session.</Text>
                                </div>
                            )}
                            {closedItems.length > 0 && (
                                <div className="flex flex-wrap align-items-center gap-2 text-xs opacity-80">
                                    <Text as="span">{`Closed: ${closedItems.length}`}</Text>
                                    {closedItems.map(item => (
                                        <Button
                                            key={`restore-${item.feedbackItemId}`}
                                            label={shortTargetId(item.targetId)}
                                            tooltip={item.targetId}
                                            className="p-button-sm p-button-text"
                                            onClick={() => void editItem(item, {removed: false})}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div
                className="border-1 border-300 border-round p-2"
                // The document takes the height the panes leave. It was capped at 200 and the
                // rest of the window stayed empty, which reads as a page that stopped loading
                // (`@@F-631`).
                style={{flex: '1 1 auto', minHeight: 120, overflow: 'auto'}}
            >
                <div className="flex align-items-center gap-2">
                    <Text
                        as="span"
                        className="font-bold text-sm"
                    >
                        Generated prose
                    </Text>
                    <Button
                        label="Copy"
                        className="p-button-sm p-button-text"
                        disabled={!document}
                        onClick={() => {
                            void navigator.clipboard?.writeText(document);
                        }}
                    />
                </div>
                <pre className="text-xs white-space-pre-wrap m-0">
                    {document || 'Nothing generated yet.'}
                </pre>
            </div>
        </div>
    );
}

/** A stored fraction as a pixel rectangle on the picture. */
function toPixels(box: IFeedbackBox, picture: IPicture) {
    return {
        x: box.x * picture.width,
        y: box.y * picture.height,
        width: box.width * picture.width,
        height: box.height * picture.height,
    };
}

/** A pixel rectangle back to fractions, which is the shape the rows hold. */
function toFractions(
    rect: {x: number; y: number; width: number; height: number},
    picture: IPicture,
): IFeedbackBox {
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    return {
        x: clamp(rect.x / picture.width),
        y: clamp(rect.y / picture.height),
        width: clamp(rect.width / picture.width),
        height: clamp(rect.height / picture.height),
    };
}

/**
 * The lines from each callout back to the element it is about.
 *
 * Drawn in the picture's own pixels — the `viewBox` is that size, so the drawing
 * scales with the image and the arrowhead keeps its shape. A hundred-unit box
 * stretched to the picture's aspect turned every head into an ellipse
 * (`@@T-495`).
 */
function Connectors({items, picture}: {items: IReviewItem[]; picture: IPicture}) {
    return (
        <svg
            viewBox={`0 0 ${picture.width} ${picture.height}`}
            style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
            }}
        >
            {items.map(item => {
                if (!item.anchor || !item.callout) return null;
                const {from, to} = connectorOf(
                    toPixels(item.callout, picture),
                    toPixels(item.anchor, picture),
                );
                return (
                    <g key={`line-${item.feedbackItemId}`}>
                        <line
                            x1={from.x}
                            y1={from.y}
                            x2={to.x}
                            y2={to.y}
                            stroke="var(--primary-color, #6366f1)"
                            strokeWidth={1.5}
                            fill="none"
                        />
                        <polygon
                            points={arrowHeadPoints(from, to)}
                            fill="var(--primary-color, #6366f1)"
                        />
                    </g>
                );
            })}
        </svg>
    );
}

/** The element a comment is about, outlined but not editable. */
function AnchorOutline({item}: {item: IReviewItem}) {
    if (!item.anchor) return null;
    return (
        <div
            title={item.targetId}
            data-review-box="anchor"
            style={{
                position: 'absolute',
                left: `${item.anchor.x * 100}%`,
                top: `${item.anchor.y * 100}%`,
                width: `${item.anchor.width * 100}%`,
                height: `${item.anchor.height * 100}%`,
                boxSizing: 'border-box',
                border: '2px solid var(--primary-color, #6366f1)',
                borderRadius: 3,
                opacity: 0.7,
                pointerEvents: 'none',
            }}
        />
    );
}

/**
 * A comment where the person left it, and the form the reviewer edits it in.
 *
 * The box is the whole editor: the top bevel is the drag handle and carries the
 * identifier's tail and the close button, the text area holds the wording and
 * saves on blur, and the corner resizes. Geometry is held in fractions while the
 * pointer moves and written back as a row update when it stops (`@@T-495`).
 */
function ReviewCallout({
    item,
    picture,
    onEdit,
    onClose,
}: {
    item: IReviewItem;
    picture: IPicture;
    onEdit: (patch: IItemEdit) => void;
    onClose: () => void;
}) {
    const [box, setBox] = useState<IFeedbackBox>(
        item.callout ?? {x: 0.05, y: 0.05, width: 0.3, height: 0.25},
    );
    const [text, setText] = useState(item.refinedText ?? item.commentText);
    const boxRef = useRef(box);

    useEffect(() => {
        const next = item.callout ?? {x: 0.05, y: 0.05, width: 0.3, height: 0.25};
        boxRef.current = next;
        // The reviewer's own box is local state and the row is the record: a reload
        // replaces both, and a save that lands elsewhere must not leave the picture
        // showing the box it held before the write.
        // eslint-disable-next-line @eslint-react/set-state-in-effect
        setBox(next);
    }, [item.callout]);

    useEffect(() => {
        // Same for the wording, which a restored comment brings back with the row.
        // eslint-disable-next-line @eslint-react/set-state-in-effect
        setText(item.refinedText ?? item.commentText);
    }, [item.refinedText, item.commentText]);

    /** Drag or resize with the pointer, clamped to the picture by the shared rules. */
    const startGesture = (mode: 'move' | 'resize') => (event: React.PointerEvent) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const start = boxRef.current;
        const startX = event.clientX;
        const startY = event.clientY;
        // The gesture listens on the window rather than on the handle: the pointer
        // leaves a small bevel almost immediately, and a reviewer dragging a box must
        // not lose it at the edge.
        let moved = false;
        const move = (pointer: PointerEvent) => {
            const dx = pointer.clientX - startX;
            const dy = pointer.clientY - startY;
            if (Math.abs(dx) + Math.abs(dy) > 1) moved = true;
            const rect = toPixels(start, picture);
            const next =
                mode === 'move' ? moveBox(rect, dx, dy, picture) : resizeBox(rect, dx, dy, picture);
            const fractions = toFractions(next, picture);
            boxRef.current = fractions;
            setBox(fractions);
        };
        const end = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', end);
            window.removeEventListener('pointercancel', end);
            if (moved) onEdit({callout: boxRef.current});
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
    };

    return (
        <div
            data-review-box="callout"
            data-review-item={item.feedbackItemId}
            style={{
                position: 'absolute',
                left: `${box.x * 100}%`,
                top: `${box.y * 100}%`,
                width: `${box.width * 100}%`,
                height: `${box.height * 100}%`,
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 4,
                overflow: 'hidden',
                // Themed: the box sits over whatever picture was captured, in whatever
                // theme the reviewer runs, and a fixed light panel read as a broken page.
                color: 'var(--text-color, #111827)',
                background: 'color-mix(in srgb, var(--surface-card, #ffffff) 92%, transparent)',
                border: '1px solid var(--primary-color, #6366f1)',
                boxShadow: '0 4px 12px rgb(0 0 0 / 25%)',
            }}
        >
            <div
                className="flex align-items-center gap-1 px-1"
                style={{
                    flex: 'none',
                    height: 20,
                    cursor: 'grab',
                    touchAction: 'none',
                    userSelect: 'none',
                    background:
                        'color-mix(in srgb, var(--primary-color, #6366f1) 18%, transparent)',
                }}
                onPointerDown={startGesture('move')}
                title={item.targetId}
            >
                <span
                    className="text-xs"
                    style={{
                        flex: '1 1 auto',
                        minWidth: 0,
                        fontFamily: 'ui-monospace, monospace',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {shortTargetId(item.targetId)}
                </span>
                <button
                    type="button"
                    aria-label="Close this comment"
                    className="p-button p-button-text p-button-sm p-0"
                    style={{flex: 'none', width: 16, height: 16, lineHeight: 1}}
                    onClick={event => {
                        event.stopPropagation();
                        onClose();
                    }}
                >
                    ×
                </button>
            </div>
            <textarea
                value={text}
                data-review-text={item.feedbackItemId}
                placeholder="What should change?"
                onChange={event => setText(event.target.value)}
                onBlur={() => {
                    const value = text.trim();
                    // An empty wording hands the comment back to the person who wrote
                    // it, which is what `wordingOf` already does with an empty refine.
                    if (value === (item.refinedText ?? '')) return;
                    onEdit({refinedText: value});
                }}
                style={{
                    flex: '1 1 auto',
                    minHeight: 0,
                    width: '100%',
                    padding: '4px 6px',
                    // `font: inherit` is what carries the box's size into the text: a
                    // textarea wears the user agent's own font otherwise.
                    font: 'inherit',
                    fontSize: '0.72rem',
                    lineHeight: 1.3,
                    resize: 'none',
                    border: 0,
                    outline: 'none',
                    background: 'transparent',
                    color: 'inherit',
                }}
            />
            <div
                aria-hidden
                onPointerDown={startGesture('resize')}
                style={{
                    position: 'absolute',
                    right: 0,
                    bottom: 0,
                    width: 10,
                    height: 10,
                    cursor: 'nwse-resize',
                    touchAction: 'none',
                    background:
                        'linear-gradient(135deg, transparent 50%, var(--primary-color, #6366f1) 50%)',
                }}
            />
        </div>
    );
}
