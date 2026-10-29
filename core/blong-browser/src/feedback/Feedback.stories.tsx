/**
 * Feedback mode stories (`@@T-475`).
 *
 * The mode is a global overlay over an application, so the stories build one: a
 * small page of annotated boxes, the mode switched on, and the store cleaned up on
 * unmount so one story never bleeds into the next.
 *
 * What they show that a unit test cannot: the hover ring and the callouts are
 * geometry over a real page, so the shape of several boxes avoiding each other is
 * something to look at.
 */
import type {Meta, StoryObj} from '@storybook/react-vite';
import {useEffect, type ReactNode} from 'react';

import {useAppStore} from '../state/appStore.js';
import {FeedbackCallout} from './FeedbackCallout.js';
import {FeedbackOutline} from './FeedbackOutline.js';
import {FeedbackSubmitBar} from './FeedbackSubmitBar.js';
import {FeedbackToggle} from './FeedbackToggle.js';
import './feedback.css';
import {FeedbackPageContext} from './useFeedbackTarget.js';

// ── Meta ───────────────────────────────────────────────────────────────────

const meta: Meta = {
    title: 'Components/Feedback',
    parameters: {layout: 'fullscreen'},
};
export default meta;

type Story = StoryObj<typeof meta>;

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Seed the store as the stories need it and restore it on unmount.
 *
 * `feedback.enabled` lives in the merged portal config, which is what the toggle
 * reads — a story that only set the store flag would render no switch.
 */
function FeedbackSetup({
    active,
    items = {},
    children,
}: {
    active: boolean;
    items?: Record<string, unknown>;
    children?: ReactNode;
}) {
    useEffect(() => {
        const previous = useAppStore.getState();
        useAppStore.setState({
            feedback: {active, items: items as never},
            portal: {
                ...previous.portal,
                portalConfig: {
                    name: 'storybook',
                    title: 'Feedback',
                    feedback: {enabled: true},
                },
            },
        });
        return () => {
            useAppStore.setState({
                feedback: {active: false, items: {}},
                portal: {...previous.portal, portalConfig: previous.portal.portalConfig},
            });
        };
    }, [active, items]);

    return (
        <FeedbackPageContext value={{subject: 'marine', object: 'coral', page: 'browse'}}>
            <div style={{padding: 24, display: 'grid', gap: 12, maxWidth: 520}}>
                <div style={{display: 'flex', justifyContent: 'flex-end'}}>
                    <FeedbackToggle />
                </div>
                <h3
                    data-feedback-id="marine.coral.browse/label"
                    data-feedback-kind="label"
                    data-feedback-label="Coral register"
                >
                    Coral register
                </h3>
                <div
                    data-feedback-id="marine.coral.browse/card:master"
                    data-feedback-kind="card"
                    data-feedback-label="Master"
                    style={{border: '1px solid #888', padding: 12, borderRadius: 4}}
                >
                    The card the comments below are about.
                </div>
                <div
                    data-feedback-id="marine.coral.browse/card:master/field:coral.coralName"
                    data-feedback-kind="field"
                    data-feedback-label="Name"
                    style={{border: '1px dashed #888', padding: 8}}
                >
                    Name field
                </div>
                {children}
            </div>
        </FeedbackPageContext>
    );
}

const twoItems = {
    'marine.coral.browse/card:master': {
        targetId: 'marine.coral.browse/card:master',
        targetKind: 'card',
        targetLabel: 'Master',
        commentText: 'This card is cut off at the bottom.',
    },
    'marine.coral.browse/card:master/field:coral.coralName': {
        targetId: 'marine.coral.browse/card:master/field:coral.coralName',
        targetKind: 'field',
        targetLabel: 'Name',
        commentText: 'The label says Name but it holds the species.',
    },
};

// ── Stories ────────────────────────────────────────────────────────────────

/** The mode off: the switch is in the menubar and nothing is painted. */
export const Inactive: Story = {
    render: () => <FeedbackSetup active={false} />,
};

/** The mode on with an empty draft: hovering a box paints it. */
export const Active: Story = {
    render: () => <FeedbackSetup active={true} />,
};

/** Two comments, each in its own callout, avoiding each other. */
export const Callouts: Story = {
    render: () => (
        <FeedbackSetup
            active={true}
            items={twoItems}
        />
    ),
};

/** The submit bar on its own, with a count in it. */
export const SubmitBar: Story = {
    render: () => (
        <FeedbackSubmitBar
            count={2}
            busy={false}
            cropping={false}
            cropped={false}
            onCrop={() => undefined}
            onSubmit={() => undefined}
            onDiscard={() => undefined}
        />
    ),
};

/** One callout on its own, at a fixed position. */
export const Callout: Story = {
    render: () => (
        <FeedbackCallout
            targetId="marine.coral.browse/table:corals/column:coralName"
            box={{x: 24, y: 24, width: 268, height: 172}}
            comment="The header wraps and cuts the text."
            onChange={() => undefined}
            onRemove={() => undefined}
            onMove={() => undefined}
            onResize={() => undefined}
        />
    ),
};

/** The rings on their own: the hover one dashed, the committed one solid. */
export const Outlines: Story = {
    render: () => (
        <div style={{position: 'relative', height: 160}}>
            <FeedbackOutline
                rect={{x: 24, y: 24, width: 220, height: 40}}
                targetId="marine.coral.browse/table:corals/column:coralName"
                tone="hover"
            />
            <FeedbackOutline
                rect={{x: 24, y: 96, width: 220, height: 40}}
                targetId="marine.coral.browse/card:master/field:coral.coralName/label"
                tone="item"
            />
        </div>
    ),
};
