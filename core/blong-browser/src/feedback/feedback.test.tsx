/**
 * feedback.test.tsx — the browser half of the feedback mode (`@@T-475`).
 *
 * Covers the parts that cannot be seen by looking at a page: the draft's
 * transitions, the callout geometry, the identifier grammar, the guard that
 * freezes the UI, the capture's failure modes, and the attributes the components
 * gain while the mode is on (`@@T-461` `@@T-462` `@@T-464` `@@T-465` `@@T-466`).
 */

import {act, render, screen} from '@testing-library/react';
import type {ReactNode} from 'react';
import {beforeEach, describe, expect, test, vi} from 'vitest';

import {useAppStore} from '../state/appStore.js';
import {FeedbackCallout} from './FeedbackCallout.js';
import {matchesShortcut, parseShortcut} from './FeedbackToggle.js';
import {captureScreen} from './capture.js';
import {installFeedbackGuard} from './guard.js';
import {
    FEEDBACK_CAPTURE_ATTR,
    FEEDBACK_ID_ATTR,
    appendSegment,
    feedbackAttributes,
    nameOfLabel,
    pageIdOf,
    portalFeedbackId,
    shortTargetId,
    targetOf,
} from './ids.js';
import {
    arrowHeadPoints,
    connectorOf,
    moveBox,
    overlapArea,
    placeCallout,
    placeCallouts,
    resizeBox,
    toFraction,
} from './placement.js';
import {
    FeedbackActiveContext,
    FeedbackPath,
    useFeedbackNode,
    useFeedbackTarget,
    useFeedbackTargetFactory,
} from './useFeedbackTarget.js';

const VIEWPORT = {width: 1000, height: 800};
const SIZE = {width: 200, height: 100};

function resetStore(): void {
    useAppStore.setState(state => ({
        feedback: {active: false, items: {}},
        hint: null,
        toasts: [],
        ...(state.feedback ? {} : {}),
    }));
}

beforeEach(() => {
    useAppStore.setState({feedback: {active: false, items: {}}});
});

describe('the draft', () => {
    test('adds, patches and removes one item per target', () => {
        const store = useAppStore.getState();
        store.feedbackAdd({targetId: 'a.b.c.field.x', targetKind: 'field', commentText: ''});
        store.feedbackAdd({targetId: 'a.b.c.field.y', targetKind: 'field', commentText: ''});
        expect(Object.keys(useAppStore.getState().feedback.items)).toHaveLength(2);

        store.feedbackUpdate('a.b.c.field.x', {commentText: 'cut off'});
        expect(useAppStore.getState().feedback.items['a.b.c.field.x'].commentText).toBe('cut off');

        // A second click on the same target replaces, never duplicates.
        store.feedbackAdd({targetId: 'a.b.c.field.x', targetKind: 'field', commentText: ''});
        expect(Object.keys(useAppStore.getState().feedback.items)).toHaveLength(2);

        store.feedbackRemove('a.b.c.field.x');
        expect(useAppStore.getState().feedback.items['a.b.c.field.x']).toBeUndefined();
    });

    test('activating keeps the draft, resetting drops it', () => {
        const store = useAppStore.getState();
        store.feedbackAdd({targetId: 'a.b.c.field.x', targetKind: 'field', commentText: 'x'});
        store.feedbackActivate(false);
        expect(Object.keys(useAppStore.getState().feedback.items)).toHaveLength(1);
        useAppStore.getState().feedbackReset();
        expect(Object.keys(useAppStore.getState().feedback.items)).toHaveLength(0);
    });
});

describe('the identifier grammar', () => {
    test('names the page and then each step down to the element', () => {
        const page = pageIdOf({subject: 'sport', object: 'club', page: 'open'});
        expect(page).toBe('sport.club.open');
        const editor = appendSegment(page, 'editor');
        const card = appendSegment(editor, 'card', 'clubDetails');
        const field = appendSegment(card, 'field', 'clubShortName');
        expect(field).toBe('sport.club.open/editor/card:clubDetails/field:clubShortName');
        expect(appendSegment(field, 'label', 'clubs')).toBe(
            'sport.club.open/editor/card:clubDetails/field:clubShortName/label:clubs',
        );
        // A screen that belongs to no model still starts somewhere.
        expect(pageIdOf(null)).toBe('blong.portal.page');
    });

    test('a name may hold dots, which is what keeps a field path readable', () => {
        expect(appendSegment('sport.club.open/editor', 'field', 'coral.coralName')).toBe(
            'sport.club.open/editor/field:coral.coralName',
        );
    });

    test('slugs a label so it survives a translation', () => {
        expect(nameOfLabel('Legal Name')).toBe('legal-name');
        expect(nameOfLabel('  Šport / Šport  ')).toBe('sport-sport');
        expect(nameOfLabel('')).toBeUndefined();
        expect(nameOfLabel(undefined)).toBeUndefined();
    });

    test('the badge shows the tail, not the whole path', () => {
        expect(shortTargetId('sport.club.open/editor/card:clubDetails/field:clubShortName')).toBe(
            'clubShortName',
        );
        expect(
            shortTargetId('sport.club.open/editor/card:clubDetails/field:clubShortName/label'),
        ).toBe('clubShortName.label');
        expect(shortTargetId('sport.club.open/editor/toolbar/button:save')).toBe('save');
        expect(shortTargetId('sport.club.open')).toBe('sport.club.open');
        expect(shortTargetId('sport.club.open/editor/toolbar')).toBe('editor/toolbar');
        expect(shortTargetId('')).toBe('');
    });

    test('names the framework chrome under the blong subject', () => {
        expect(portalFeedbackId('menuItem', 'sport.club.browse')).toBe(
            'blong.portal.page/menuItem:sport.club.browse',
        );
        expect(portalFeedbackId('tab', 'sport.club.browse')).toBe(
            'blong.portal.page/tab:sport.club.browse',
        );
        expect(portalFeedbackId('page')).toBe('blong.portal.page/page');
    });

    test('reads the target back off an element', () => {
        const element = document.createElement('div');
        element.setAttribute('title', 'Name');
        for (const [key, value] of Object.entries(
            feedbackAttributes('sport.club.browse/table:clubs/column:legalName', 'column', 'Name'),
        )) {
            element.setAttribute(key, value);
        }
        expect(targetOf(element)).toEqual({
            targetId: 'sport.club.browse/table:clubs/column:legalName',
            targetKind: 'column',
            targetLabel: 'Name',
            domHint: 'div title="Name"',
        });
    });
});

describe('callout placement', () => {
    const anchor = {x: 400, y: 300, width: 100, height: 40};

    test('prefers the right side when it fits', () => {
        expect(placeCallout({anchor, size: SIZE, viewport: VIEWPORT}).side).toBe('right');
    });

    test('falls to the left when the right edge has no room', () => {
        const nearRight = {x: 940, y: 300, width: 50, height: 40};
        expect(placeCallout({anchor: nearRight, size: SIZE, viewport: VIEWPORT}).side).toBe('left');
    });

    test('stays inside the viewport', () => {
        const nearBottom = {x: 10, y: 780, width: 50, height: 10};
        const {rect} = placeCallout({anchor: nearBottom, size: SIZE, viewport: VIEWPORT});
        expect(rect.y + rect.height).toBeLessThanOrEqual(VIEWPORT.height);
        expect(rect.x).toBeGreaterThanOrEqual(0);
    });

    test('avoids a callout that is already placed', () => {
        const taken = [{x: 508, y: 300, width: SIZE.width, height: SIZE.height}];
        const placement = placeCallout({anchor, size: SIZE, viewport: VIEWPORT, taken});
        expect(overlapArea(placement.rect, taken[0])).toBe(0);
        expect(placement.side).not.toBe('right');
    });

    test('solves a batch without stacking two boxes', () => {
        const placed = placeCallouts(
            [
                {key: 'a', anchor: {x: 10, y: 100, width: 100, height: 40}},
                {key: 'b', anchor: {x: 10, y: 400, width: 100, height: 40}},
            ],
            SIZE,
            VIEWPORT,
        );
        expect(overlapArea(placed.a.rect, placed.b.rect)).toBe(0);
    });
});

describe('the guard', () => {
    function menu() {
        const overlay = document.createElement('div');
        const item = document.createElement('a');
        item.setAttribute(FEEDBACK_ID_ATTR, 'marine.coral.browse.card.master');
        overlay.appendChild(item);
        document.body.appendChild(overlay);
        let closes = 0;
        document.addEventListener('click', () => closes++);
        document.addEventListener('pointerdown', () => closes++);
        return {item, closes: () => closes, cleanup: () => overlay.remove()};
    }

    test('stops a click on a target from reaching the page and reports it', () => {
        const {item, closes, cleanup} = menu();
        const seen: string[] = [];
        const remove = installFeedbackGuard({onTargetClick: element => seen.push(element.tagName)});

        act(() => {
            item.dispatchEvent(new MouseEvent('pointerdown', {bubbles: true, cancelable: true}));
            item.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
        });

        expect(closes()).toBe(0);
        expect(seen).toEqual(['A']);
        remove();
        cleanup();
    });

    test('lets the mode’s own chrome through', () => {
        const callout = document.createElement('textarea');
        callout.setAttribute('data-feedback-ui', 'callout');
        document.body.appendChild(callout);
        let reached = 0;
        document.addEventListener('click', () => reached++);
        const remove = installFeedbackGuard({onTargetClick: () => undefined});

        act(() => {
            callout.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
        });

        expect(reached).toBe(1);
        remove();
        callout.remove();
    });
});

describe('the capture', () => {
    test('returns unavailable when the API is missing', async () => {
        const original = navigator.mediaDevices;
        Object.defineProperty(navigator, 'mediaDevices', {value: undefined, configurable: true});
        try {
            await expect(captureScreen()).resolves.toEqual({status: 'unavailable'});
        } finally {
            Object.defineProperty(navigator, 'mediaDevices', {
                value: original,
                configurable: true,
            });
        }
    });

    test('reports a refused capture as denied, not as an error', async () => {
        const original = navigator.mediaDevices;
        const refused = Object.assign(new Error('no'), {name: 'NotAllowedError'});
        Object.defineProperty(navigator, 'mediaDevices', {
            value: {getDisplayMedia: () => Promise.reject(refused)},
            configurable: true,
        });
        try {
            await expect(captureScreen()).resolves.toEqual({status: 'denied'});
        } finally {
            Object.defineProperty(navigator, 'mediaDevices', {
                value: original,
                configurable: true,
            });
        }
    });

    test('hides the overlay attribute while it grabs the frame', async () => {
        const original = navigator.mediaDevices;
        const seen: Array<string | null> = [];
        Object.defineProperty(navigator, 'mediaDevices', {
            value: {
                getDisplayMedia: () => {
                    seen.push(document.documentElement.getAttribute(FEEDBACK_CAPTURE_ATTR));
                    // A stream with no tracks is enough: the frame grab fails and the
                    // interesting assertion is that the attribute was set, and removed.
                    return Promise.resolve({getTracks: () => []} as unknown as MediaStream);
                },
            },
            configurable: true,
        });
        try {
            await captureScreen();
            expect(seen).toEqual(['on']);
            expect(document.documentElement.hasAttribute(FEEDBACK_CAPTURE_ATTR)).toBe(false);
        } finally {
            Object.defineProperty(navigator, 'mediaDevices', {
                value: original,
                configurable: true,
            });
        }
    });
});

describe('the shortcut', () => {
    test('parses modifiers and matches case-insensitively', () => {
        expect(parseShortcut('Alt+F')).toEqual({alt: true, ctrl: false, shift: false, key: 'f'});
        const event = new KeyboardEvent('keydown', {key: 'f', altKey: true});
        expect(matchesShortcut(event, 'Alt+f')).toBe(true);
        expect(matchesShortcut(new KeyboardEvent('keydown', {key: 'f'}), 'Alt+f')).toBe(false);
    });

    test('F2 needs no modifier, which is why it is the default', () => {
        expect(parseShortcut('F2')).toEqual({alt: false, ctrl: false, shift: false, key: 'f2'});
        expect(matchesShortcut(new KeyboardEvent('keydown', {key: 'F2'}), 'F2')).toBe(true);
        expect(matchesShortcut(new KeyboardEvent('keydown', {key: 'F2', altKey: true}), 'F2')).toBe(
            false,
        );
    });
});

/** Render a probe inside (or outside) the activity context. */
function withMode(active: boolean, children: ReactNode) {
    return <FeedbackActiveContext value={active}>{children}</FeedbackActiveContext>;
}

/**
 * The components these tests render, at module level: `@eslint-react` refuses a
 * component defined inside a function, because a component that is re-created per
 * render loses its state — the rule is worth keeping even where the state is a
 * test's.
 */
function Probe() {
    const target = useFeedbackTarget('field', 'coral.coralName', 'Name');
    return (
        <span
            data-testid="probe"
            {...target}
        />
    );
}

function Nested() {
    const card = useFeedbackNode('card', 'clubDetails', 'Club details');
    return (
        <div {...card?.attributes}>
            {card ? (
                <FeedbackPath path={card.path}>
                    <Probe />
                </FeedbackPath>
            ) : (
                <Probe />
            )}
        </div>
    );
}

/** A probe that counts whether its composer was evaluated at all. */
function Uncalled({compose}: {compose: () => string}) {
    const factory = useFeedbackTargetFactory();
    // The argument must not be evaluated at all: an optional call stops before
    // its arguments.
    const attributes = {...factory?.('button', compose())};
    return (
        <span
            data-testid="uncalled"
            {...attributes}
        />
    );
}

describe('the target hook', () => {
    test('is inert while the mode is off', () => {
        render(<Probe />);
        expect(screen.getByTestId('probe').hasAttribute(FEEDBACK_ID_ATTR)).toBe(false);
    });

    test('costs nothing while the mode is off: no identifier, no call, no wrapper', () => {
        // The store says nothing here — the mode is read from the context, so a
        // component that is never inside `App` never subscribes (`@@D-667`).
        const compose = vi.fn(() => 'never asked');
        render(
            <>
                <Nested />
                <Uncalled compose={compose} />
            </>,
        );
        const [probe] = screen.getAllByTestId('probe');
        expect(probe.hasAttribute(FEEDBACK_ID_ATTR)).toBe(false);
        expect(compose).not.toHaveBeenCalled();
        // The card renders no step of its own while the mode is off: the field is
        // its direct child, not a child of a provider.
        expect(probe.parentElement?.getAttribute(FEEDBACK_ID_ATTR)).toBeNull();
    });

    test('carries the identifier and the label while it is on', () => {
        render(withMode(true, <Probe />));
        const probe = screen.getByTestId('probe');
        expect(probe.getAttribute(FEEDBACK_ID_ATTR)).toBe(
            'blong.portal.page/field:coral.coralName',
        );
        expect(probe.getAttribute('data-feedback-label')).toBe('Name');
    });

    test('extends the path the enclosing container published', () => {
        render(withMode(true, <Nested />));
        // The card is one step, and the field inside it is the next one.
        expect(screen.getByTestId('probe').getAttribute(FEEDBACK_ID_ATTR)).toBe(
            'blong.portal.page/card:clubDetails/field:coral.coralName',
        );
    });
});

describe('the callout', () => {
    test('shows the wording and the tail of the identifier, with the path as a tooltip', () => {
        render(
            <FeedbackCallout
                targetId="sport.club.browse/table:clubs/column:legalName"
                box={{x: 10, y: 10, width: 200, height: 100}}
                comment="cut off"
                onChange={() => undefined}
                onRemove={() => undefined}
                onMove={() => undefined}
                onResize={() => undefined}
            />,
        );
        const handle = screen.getByText('legalName');
        expect(handle).toBeTruthy();
        expect(handle.closest('[data-feedback-ui="callout"]')).toBeTruthy();
        expect(handle.getAttribute('title')).toBe('sport.club.browse/table:clubs/column:legalName');
        expect(screen.getByDisplayValue('cut off')).toBeTruthy();
        // The box is the size the person left it at, not a fixed one.
        const box = document.querySelector('.blong-feedback-callout') as HTMLElement;
        expect(box.style.width).toBe('200px');
        expect(box.style.height).toBe('100px');
    });

    test('reports a drag on the bevel and a drag on the corner separately', () => {
        const moved: number[] = [];
        const resized: number[] = [];
        render(
            <FeedbackCallout
                targetId="sport.club.browse/table:clubs/column:legalName"
                box={{x: 10, y: 10, width: 200, height: 100}}
                comment=""
                onChange={() => undefined}
                onRemove={() => undefined}
                onMove={dx => moved.push(dx)}
                onResize={dx => resized.push(dx)}
            />,
        );
        const bevel = document.querySelector('.blong-feedback-callout__bevel') as HTMLElement;
        const corner = document.querySelector('.blong-feedback-callout__resize') as HTMLElement;
        expect(bevel).toBeTruthy();
        expect(corner).toBeTruthy();
        // jsdom has no pointer capture; the handler must not depend on it.
        expect(() =>
            bevel.dispatchEvent(
                new Event('pointerdown', {bubbles: true}) as unknown as PointerEvent,
            ),
        ).not.toThrow();
    });
});

describe('the callout box and its line back to the element', () => {
    test('moves and resizes inside the viewport, never below the minimum', () => {
        const box = {x: 10, y: 10, width: 200, height: 120};
        expect(moveBox(box, -100, -100, VIEWPORT)).toEqual({...box, x: 0, y: 0});
        expect(moveBox(box, 10_000, 10_000, VIEWPORT)).toEqual({...box, x: 800, y: 680});
        expect(resizeBox(box, 100, 100, VIEWPORT)).toEqual({...box, width: 300, height: 220});
        expect(resizeBox(box, -1000, -1000, VIEWPORT)).toEqual({...box, width: 200, height: 120});
    });

    test('lands both ends of the connector on a border, not a centre', () => {
        const callout = {x: 400, y: 300, width: 200, height: 100};
        const anchor = {x: 100, y: 320, width: 100, height: 40};
        const {from, to} = connectorOf(callout, anchor);
        // Border to border: the callout's left edge, and the element's right edge
        // pushed out to the outer edge of the ring it carries, so the arrowhead
        // touches the ring instead of disappearing under it.
        expect(from.x).toBeCloseTo(400, 5);
        expect(to.x).toBeCloseTo(202, 5);
        // Both points sit on the line joining the two centres, so the line is
        // straight and the arrow keeps pointing at the element.
        const slope = (340 - 350) / (150 - 500);
        expect((from.y - 350) / (from.x - 500)).toBeCloseTo(slope, 5);
        expect((to.y - 340) / (to.x - 150)).toBeCloseTo(slope, 5);
    });

    test('points an arrowhead along the line it belongs to', () => {
        const points = arrowHeadPoints({x: 0, y: 0}, {x: 100, y: 0}).split(' ');
        expect(points).toHaveLength(3);
        // The tip is the element's border point, and the base sits behind it.
        expect(points[0]).toBe('100,0');
        expect(points[1].startsWith('90,')).toBe(true);
    });

    test('stores a box as a fraction of the region that was kept', () => {
        const region = {x: 100, y: 50, width: 400, height: 300};
        expect(toFraction({x: 300, y: 200, width: 200, height: 150}, region)).toEqual({
            x: 0.5,
            y: 0.5,
            width: 0.5,
            height: 0.5,
        });
        // Anything outside the region is clamped into it rather than stored as a
        // coordinate the review page could not draw.
        expect(toFraction({x: 0, y: 0, width: 1000, height: 1000}, region)).toEqual({
            x: 0,
            y: 0,
            width: 1,
            height: 1,
        });
    });
});

// Silence the unused-helper lint for the local resetter above.
void resetStore;
