import {schema} from '@feasibleone/blong';

/**
 * meta/type/schema.ts — the feedback tables (`@@T-455`).
 *
 * Three tables, matching plan section 5:
 *  - `session` — one submission: the page it came from, who sent it, the state
 *    of the screenshot and the review status (`@@D-660`).
 *  - `item` — one commented element of that page, keyed by the logical
 *    identifier of plan section 3 (`@@D-657`).
 *  - `shot` — the screenshot, alone in its own table so a session list never
 *    drags the image with it.
 *
 * The session is resource-backed (`type.uuid()` PK plus a foreign key to
 * `core.resource.resourceId`), which registers the submitter and the reviewer in
 * the resource graph; the two details are not resources, following party's
 * contact/address pattern.
 *
 * There is no prose column on purpose: the Markdown a coding agent receives is
 * rendered from these rows when it is asked for, never stored (`@@D-660`).
 */
export default schema(async ({lib: {type}}) => ({
    session: type.Object(
        {
            sessionId: type.uuid(),
            pageUrl: type.stringNotNull({maxLength: 1000}),
            pageTitle: type.stringNull({maxLength: 255}),
            pageSubject: type.stringNull({maxLength: 100}),
            pageObject: type.stringNull({maxLength: 100}),
            pageKind: type.stringNull({maxLength: 40}),
            languageCode: type.stringNull({maxLength: 10}),
            userResourceId: type.uidNull(),
            viewportJSON: type.stringNull({maxLength: 500}),
            shotStatus: type.stringNotNull({maxLength: 20}),
            status: type.stringNotNull({maxLength: 20}),
            processedBy: type.uidNull(),
            processedAt: type.dateTimeNull(),
            submittedAt: type.dateTimeNotNull(),
        },
        {
            constraints: {
                primaryKey: 'sessionId',
                index: {
                    submittedAt: {},
                    status: {},
                },
                foreign: {
                    sessionId: 'core.resource.resourceId',
                    userResourceId: 'core.resource.resourceId',
                    processedBy: 'core.resource.resourceId',
                },
            },
        },
    ),

    item: type.Object(
        {
            feedbackItemId: type.ulid(),
            sessionId: type.uidNotNull(),
            itemIndex: type.integerNotNull(),
            // 255 keeps the column a VARCHAR, which is what lets the unique
            // (sessionId, targetId) index exist — MySQL refuses a key on a TEXT
            // column without a prefix length. The longest identifier a page emits
            // is well inside this.
            targetId: type.stringNotNull({maxLength: 255}),
            targetKind: type.stringNotNull({maxLength: 40}),
            targetLabel: type.stringNull({maxLength: 255}),
            domHint: type.stringNull({maxLength: 500}),
            // Both boxes are fractions of the region the picture kept, as a small
            // JSON object — a few dozen characters each (`@@T-489`, `@@T-490`).
            anchorJSON: type.stringNull({maxLength: 500}),
            calloutJSON: type.stringNull({maxLength: 500}),
            commentText: type.stringNotNull({maxLength: 8000}),
            refinedText: type.stringNull({maxLength: 20000}),
            // A reviewer may close a comment that is noise or already fixed. The row
            // stays: closing is a review act, not a delete, and the prose skips it.
            removedAt: type.dateTimeNull(),
            createdAt: type.dateTimeNotNull(),
        },
        {
            constraints: {
                primaryKey: 'feedbackItemId',
                unique: {
                    sessionTarget: {columns: ['sessionId', 'targetId']},
                },
                index: {
                    sessionId: {},
                },
                foreign: {
                    sessionId: 'feedback.session.sessionId',
                },
            },
        },
    ),

    shot: type.Object(
        {
            sessionId: type.uidNotNull(),
            // Above 65 535 the schema adapter asks knex for `longtext`, which a
            // data-URL screenshot needs (`@@D-661`).
            shotData: type.stringNotNull({maxLength: 8000000}),
            mimeType: type.stringNotNull({maxLength: 40}),
            shotWidth: type.integerNull(),
            shotHeight: type.integerNull(),
            byteSize: type.integerNull(),
        },
        {
            constraints: {
                primaryKey: 'sessionId',
                foreign: {
                    sessionId: 'feedback.session.sessionId',
                },
            },
        },
    ),
}));
