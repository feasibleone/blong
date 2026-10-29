/**
 * The feedback mode's browser half (`@@T-462`).
 *
 * `FeedbackLayer` is mounted once by `App`; `FeedbackToggle` goes in the menubar;
 * `useFeedbackTarget` is what every addressable component calls. The pieces are
 * exported so a realm can render the review page's picker and so the unit tests
 * can reach the pure helpers.
 */

export {captureScreen, type FeedbackCaptureStatus, type ICaptureOutcome} from './capture.js';
export {FeedbackCallout, type IFeedbackCalloutProps} from './FeedbackCallout.js';
export {FeedbackLayer} from './FeedbackLayer.js';
export {FeedbackOutline, type IFeedbackOutlineProps} from './FeedbackOutline.js';
export {FeedbackSubmitBar, type IFeedbackSubmitBarProps} from './FeedbackSubmitBar.js';
export {FeedbackToggle, matchesShortcut, parseShortcut} from './FeedbackToggle.js';
export {installFeedbackGuard, type IFeedbackGuardOptions} from './guard.js';
export {
    appendSegment,
    buildFeedbackPath,
    closestFeedbackTarget,
    domHintOf,
    fallbackContext,
    FEEDBACK_CAPTURE_ATTR,
    FEEDBACK_ID_ATTR,
    FEEDBACK_KIND_ATTR,
    FEEDBACK_LABEL_ATTR,
    FEEDBACK_UI_ATTR,
    feedbackAttributes,
    isFeedbackUi,
    nameOfLabel,
    pageIdOf,
    portalFeedbackId,
    rectOf,
    segmentOf,
    shortTargetId,
    targetOf,
    type IFeedbackModelContext,
} from './ids.js';
export {
    arrowHeadPoints,
    connectorOf,
    MIN_CALLOUT,
    moveBox,
    overlapArea,
    placeCallout,
    placeCallouts,
    resizeBox,
    toFraction,
    type IFeedbackRect,
    type IFeedbackSide,
    type IPlacement,
} from './placement.js';
export {useFeedbackConfig} from './useFeedbackConfig.js';
export {useFeedbackFreeze} from './useFeedbackFreeze.js';
export {
    FeedbackActiveContext,
    FeedbackPageContext,
    FeedbackPath,
    FeedbackRegion,
    segmentId,
    useFeedbackActive,
    useFeedbackNode,
    useFeedbackPage,
    useFeedbackPageTarget,
    useFeedbackPath,
    useFeedbackTarget,
    useFeedbackTargetFactory,
    type IFeedbackNode,
} from './useFeedbackTarget.js';
