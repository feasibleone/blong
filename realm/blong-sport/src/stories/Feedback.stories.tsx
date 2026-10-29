/**
 * Sport / feedback mode (`@@T-476`).
 *
 * The same pages as the other sport stories, with the mode switched on and a few
 * comments dropped on real targets. What these show that a unit test cannot: the
 * identifiers land on the elements a person would point at (a column header, a
 * field, a card), and the callouts sit beside them rather than on top.
 *
 * The mode is entered by writing the store, not by clicking the menubar switch:
 * the storybook decorator renders `App` with `children`, so the portal shell (and
 * its switch) is not part of the picture, while the overlay layer is.
 */
import {useAppStore} from '@feasibleone/blong-browser';
import {page} from '@feasibleone/blong-browser/storyHelper';
import type {Meta, StoryObj} from '@storybook/react-vite';

const meta: Meta = {title: 'Sport/Feedback', parameters: {layout: 'fullscreen'}};
export default meta;

type PlayContext = {canvasElement: HTMLElement};

/**
 * The feedback slice, cast because this realm type-checks against
 * `blong-browser`'s built declarations, which predate it — the same lag recorded
 * as `@@F-624`. The cast disappears once the package is built again.
 */
const feedbackStore = useAppStore as unknown as {
    setState: (partial: {feedback: {active: boolean; items: Record<string, unknown>}}) => void;
    getState: () => {
        feedbackUpdate: (targetId: string, patch: {commentText: string}) => void;
    };
};

/** Wait for a selector to appear — a model page loads its schema first. */
async function waitFor(canvas: HTMLElement, selector: string): Promise<HTMLElement | null> {
    // Long enough for a published build: the platform loads its schema and then
    // renders, and in a static Storybook that is seconds, not frames. The stories
    // are opened by readers too, where a short wait left them with an empty page
    // and no comment.
    for (let attempt = 0; attempt < 400; attempt++) {
        const element = canvas.querySelector<HTMLElement>(selector);
        if (element) return element;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    return null;
}

/**
 * Switch the mode on and leave `count` comments on elements matching `selectors`.
 *
 * The click goes through a real `MouseEvent` rather than a store write, so the
 * guard and the layer's own click handling are exercised: the identifier comes off
 * the element, exactly as it does for a person.
 */
async function commentOn(
    canvas: HTMLElement,
    entries: Array<{selector: string; comment: string}>,
): Promise<void> {
    feedbackStore.setState({feedback: {active: true, items: {}}});
    for (const {selector, comment} of entries) {
        const element = await waitFor(canvas, selector);
        if (!element) continue;
        element.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
        const targetId = element.getAttribute('data-feedback-id');
        if (!targetId) continue;
        // The textarea is reachable through the store; typing is what a person
        // does, and this keeps the story deterministic.
        await new Promise(resolve => setTimeout(resolve, 20));
        feedbackStore.getState().feedbackUpdate(targetId, {commentText: comment});
    }
    // A frame for the layer to measure the new targets before the snapshot.
    await new Promise(resolve => setTimeout(resolve, 120));
}

/** Browse page with the mode on: a column, a card and a field commented. */
export const AthleteBrowseFeedback: StoryObj = {
    ...page('sport.athlete.browse'),
    play: async ({canvasElement}: PlayContext) => {
        await commentOn(canvasElement, [
            {
                selector: '[data-feedback-kind="column"]',
                comment: 'The header wraps and cuts the text at 1280px.',
            },
            {
                selector: '[data-feedback-kind="card"]',
                comment: 'This card is cut off at the bottom.',
            },
        ]);
    },
};

/** Open page with the mode on: two fields commented. */
export const AthleteOpenFeedback: StoryObj = {
    ...page('sport.athlete.open', 1),
    play: async ({canvasElement}: PlayContext) => {
        await commentOn(canvasElement, [
            {
                selector: '[data-feedback-kind="field"]',
                comment: 'The label says Name but it holds the species.',
            },
        ]);
    },
};
