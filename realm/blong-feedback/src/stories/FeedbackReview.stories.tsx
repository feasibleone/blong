/**
 * FeedbackReview stories (`@@T-474`).
 *
 * The page is an ordinary component over the handler proxy, so the stories hand it
 * a stub proxy and the fixture data instead of a running server: the point is to
 * work on the layout — the queue, the anchors over the picture, the document pane
 * — without a backend.
 *
 * The stub is a small realm, not a set of answers: `feedback.item.edit` writes to
 * an in-memory list of items and `feedback.prose.render` runs the realm's own
 * `renderProse` over it, so a reviewer's edit shows up in the document exactly as
 * it does against a database (`@@T-499`). A stub that returned a fixed document
 * made the story lie about the one thing the workflow is for.
 */
import type {Meta, StoryObj} from '@storybook/react-vite';
import React, {useEffect, useState} from 'react';

import type {IHandlerProxy} from '@feasibleone/blong';
import {BlongProvider, makeHandlerProxy} from '@feasibleone/blong-browser';

import {FeedbackReviewPage} from '../pages/feedbackReviewPage.js';
import {FIXTURE_SHOT} from './feedbackReviewShot.js';
import {makeStubDispatch} from './feedbackReviewStub.js';

const meta: Meta = {title: 'Feedback/Review', parameters: {layout: 'fullscreen'}};
export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Walk the page the way a reviewer would: open the first session, then render the
 * document for it.
 *
 * The page marks its clickable row (`data-feedback-queue-row`) for exactly this: a
 * story or a Playwright test needs a handle that is not a CSS position. The
 * document is rendered too, because a story that stops one act short shows a pane
 * that says "Nothing generated yet" and hides the half of the workflow the page
 * exists for.
 *
 * The wait is long on purpose: a published Storybook loads the platform before it
 * renders anything, which is seconds rather than frames, and a short one left the
 * story open on an empty page with no document to read.
 */
function AutoOpen() {
    useEffect(() => {
        let tries = 0;
        let click: ReturnType<typeof setTimeout> | undefined;
        const timer = setInterval(() => {
            const row = document.querySelector<HTMLElement>('[data-feedback-queue-row]');
            if (row) {
                row.click();
                clearInterval(timer);
                // The button renders only once the session's items have arrived.
                click = setTimeout(() => {
                    const generate = [
                        ...document.querySelectorAll<HTMLButtonElement>('button'),
                    ].find(button => button.textContent?.trim() === 'Generate prose');
                    generate?.click();
                }, 400);
            } else if (++tries > 300) clearInterval(timer);
        }, 50);
        return () => {
            clearInterval(timer);
            if (click) clearTimeout(click);
        };
    }, []);
    return null;
}

function ReviewHost({autoOpen = false}: {autoOpen?: boolean}) {
    const [proxy] = useState<IHandlerProxy<Record<string, unknown>>>(
        () =>
            makeHandlerProxy(makeStubDispatch(FIXTURE_SHOT)) as IHandlerProxy<
                Record<string, unknown>
            >,
    );
    return (
        <BlongProvider handlerProxy={proxy}>
            <FeedbackReviewPage />
            {autoOpen && <AutoOpen />}
        </BlongProvider>
    );
}

/** The queue with nothing picked: the left pane only. */
export const Queue: Story = {
    render: () => <ReviewHost />,
};

/** A session open: the picture with its anchors, the comments and the document. */
export const Open: Story = {
    render: () => <ReviewHost autoOpen />,
};

/** The same page at a narrow width, where the two panes have to share. */
export const Narrow: Story = {
    render: () => (
        <div style={{width: 720}}>
            <ReviewHost autoOpen />
        </div>
    ),
};
