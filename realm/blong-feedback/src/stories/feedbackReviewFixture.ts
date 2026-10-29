/**
 * feedbackReviewFixture.ts — the data the review-page story shows (`@@T-474`).
 *
 * A picture, a session and two comments, shaped exactly like the answers of
 * `feedback.session.list`, `feedback.session.items` and `feedback.shot.get`, so the
 * page can be worked on without a server. Every number here is copied from a real
 * submission — `img/feedbackShot.jpg` is the capture that submission stored and the
 * anchors are the fractions it recorded — so the boxes land on the elements they
 * were drawn around instead of on a mock screen that can be bent to fit.
 */
/** The size of that capture, in the pixels it was stored with. */
export const FIXTURE_SHOT_SIZE = {shotWidth: 847, shotHeight: 320};

export const FIXTURE_SESSIONS = [
    {
        sessionId: 'cffb9037-b815-426d-8331-2091ec995b4a',
        pageUrl: '/s/club',
        pageTitle: 'Clubs',
        pageSubject: 'sport',
        pageObject: 'club',
        pageKind: 'browse',
        languageCode: 'en',
        shotStatus: 'captured',
        status: 'new',
        submittedAt: '2026-10-29T13:55:00.000Z',
        itemCount: 2,
    },
    {
        sessionId: 'bb13ca19-fdc8-4835-b991-7a2b8b1d3583',
        pageUrl: '/s/',
        pageTitle: 'Blong Sport',
        pageSubject: 'sport',
        pageObject: 'portal',
        pageKind: 'page',
        languageCode: 'bg',
        shotStatus: 'unavailable',
        status: 'new',
        submittedAt: '2026-10-29T13:40:00.000Z',
        itemCount: 1,
    },
];

export const FIXTURE_ITEMS = [
    {
        feedbackItemId: '01JB7Q9K3M4N5P6R7S8T9V0W1X',
        targetId: 'sport.club.browse/card:browse/field:club/table:club/column:clubShortName/label',
        targetKind: 'label',
        targetLabel: 'Short Name',
        anchor: {x: 0.5862, y: 0.2152, width: 0.0928, height: 0.05},
        callout: {x: 0.7049, y: 0.2152, width: 0.2951, height: 0.5375},
        commentText: 'The label does not say which club this filter is for.',
        itemIndex: 0,
    },
    {
        feedbackItemId: '01JB7Q9K3M4N5P6R7S8T9V0W1Y',
        targetId: 'sport.club.browse/card:browse/field:club/table:club/column:legalName',
        targetKind: 'column',
        targetLabel: 'Legal Name',
        anchor: {x: 0.026, y: 0.1688, width: 0.1986, height: 0.143},
        callout: {x: 0.3332, y: 0.2938, width: 0.3872, height: 0.6625},
        commentText: 'The header wraps and cuts the text.',
        itemIndex: 1,
    },
];
