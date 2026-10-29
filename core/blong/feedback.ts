/**
 * feedback.ts — the payload contract between the browser's feedback mode and the
 * `feedback` realm (`@@T-460`).
 *
 * One shape, two platforms: the browser builds `IFeedbackSessionInput` while the
 * person comments, `feedback.session.add` stores it, and both the review page and
 * the prose renderer read the stored rows back as `IFeedbackSession` and
 * `IFeedbackItem`. Keeping the types here rather than in either package is what
 * lets `core/blong-browser` stay free of a dependency on `realm/blong-feedback`
 * (`@@D-662`).
 */

/** What kind of thing a person pointed at. Part of the identifier grammar. */
export type FeedbackTargetKind =
    | 'page'
    | 'editor'
    | 'toolbar'
    | 'button'
    | 'tab'
    | 'card'
    | 'field'
    | 'label'
    | 'column'
    | 'table'
    | 'menu'
    | 'menuItem'
    | 'widget'
    | 'section';

/**
 * A rectangle as fractions of the captured region — 0 to 1 on each axis.
 *
 * Fractions rather than pixels, because the review page draws the same boxes over
 * a picture whose size nobody controls: the capture is downscaled, the crop is
 * the person's, and the browser window changes between sessions (`@@T-490`).
 */
export interface IFeedbackBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * One element that can be pointed at, as the browser sees it.
 *
 * `targetId` is the logical path to the element — the page id, then one
 * `kind:name` segment per container, e.g.
 * `sport.club.open/card:clubDetails/field:clubShortName` (`@@T-487`). It
 * names a place in the source tree, never a DOM node and never an array index,
 * which is what makes feedback actionable.
 */
export interface IFeedbackTarget {
    targetId: string;
    targetKind: FeedbackTargetKind;
    /** The translated visible label of the element, for a reader with no source access. */
    targetLabel?: string;
    /** Tag name, `aria-label` and `title` attribute of the element, joined. */
    domHint?: string;
    /** The element's rectangle when it was commented on, as fractions of the shot. */
    anchor?: IFeedbackBox;
}

/** One comment: a target plus the wording, and the reviewer's refinement of it. */
export interface IFeedbackItem extends IFeedbackTarget {
    /** The person's words, verbatim. */
    commentText: string;
    /** The reviewer's clarification; the prose prefers it over `commentText`. */
    refinedText?: string;
    /** Position in the submission, so the document reads in the order the boxes were made. */
    itemIndex?: number;
    /**
     * When a reviewer closed the comment, as an ISO timestamp.
     *
     * A closed comment is kept — the words are the person's — but the review page
     * does not draw its callout and the prose does not quote it (`@@T-496`).
     */
    removedAt?: string;
    /**
     * Where the person left the comment box, as fractions of the shot.
     *
     * Absent means "wherever the reader wants it": the box is a note beside the
     * element, and the element's own rectangle is what the document points at.
     */
    callout?: IFeedbackBox;
}

/** The screenshot of one submission. */
export interface IFeedbackShot {
    /** A data URL (`data:image/jpeg;base64,…`). */
    shotData: string;
    mimeType: string;
    shotWidth?: number;
    shotHeight?: number;
    byteSize?: number;
}

/** Why a submission may carry no picture. */
export type FeedbackShotStatus = 'captured' | 'denied' | 'unavailable';

/** The state a reviewer moves a session through. */
export type FeedbackSessionStatus = 'new' | 'processed';

/** What the browser sends: the page, the items and the shot, in one call. */
export interface IFeedbackSessionInput {
    pageUrl: string;
    pageTitle?: string;
    pageSubject?: string;
    pageObject?: string;
    pageKind?: string;
    languageCode?: string;
    viewportJSON?: string;
    shotStatus: FeedbackShotStatus;
    items: IFeedbackItem[];
    shot?: IFeedbackShot;
}

/** A stored session, as the review page and the renderer read it. */
export interface IFeedbackSession {
    sessionId: string;
    pageUrl: string;
    pageTitle?: string;
    pageSubject?: string;
    pageObject?: string;
    pageKind?: string;
    languageCode?: string;
    userResourceId?: string;
    viewportJSON?: string;
    shotStatus: FeedbackShotStatus;
    status: FeedbackSessionStatus;
    processedBy?: string;
    processedAt?: string;
    submittedAt: string;
    items?: IFeedbackItem[];
}
