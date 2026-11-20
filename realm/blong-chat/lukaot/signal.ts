import {declare} from '@feasibleone/lukaot';

/**
 * What the `chat` realm reports while it carries a conversation (`@@D-896`).
 *
 * The four failure names are separate because they are four different answers to "the channel did not
 * get written to": a question that could not be rewritten still gets its answer as a message, a
 * timed-out question that could not be closed leaves a stale control, an explanation that could not be
 * posted still leaves the question. None of them fails the ask, so the record is the only trace, and an
 * operator needs to tell them apart to know which message a person is looking at.
 */
export default declare({
    log: {
        /** A message arrived on an account no consumer is configured for, so it was dropped. */
        chatInboundUnconsumed: {
            level: 'info',
            message: 'chat message dropped: no consumer configured for {kind} on {platform}',
        },
        /** The question's own message could not be rewritten with the answer; a message is tried instead. */
        chatPromptSettleFailed: {
            level: 'warn',
            message: 'the question message could not be rewritten with the answer, posting it instead: {error}',
        },
        /** The answer could not be posted as a message either, so the channel does not show it. */
        chatPromptAnswerPostFailed: {
            level: 'warn',
            message: 'the answer could not be posted to the conversation: {error}',
        },
        /** A question that timed out could not have its controls removed. */
        chatPromptCloseFailed: {
            level: 'warn',
            message: 'the timed-out question could not be closed and stays editable: {error}',
        },
        /** The reasoning above a question could not be posted, so it is asked without its context. */
        chatPromptExplanationFailed: {
            level: 'warn',
            message: 'the question explanation could not be posted, asking without it: {error}',
        },
    },
});
