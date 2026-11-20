import {contribute, type IVocabulary} from '@feasibleone/lukaot';

/**
 * What the `browser` realm reports while a page works.
 *
 * These were the realm's only three level calls, and all three were the shape the conversion exists
 * to remove: a payload handed to `warn` with its sentence composed at the call site, so an operator
 * could neither raise one of them nor tell them apart in a search. Two are the silent endings of a
 * login — a response that carries no token leaves the form up with nothing said, and a call that
 * throws leaves it asking again — and one is a model that promised something it does not state.
 *
 * Contributed rather than only declared, because a page has no port for the realms it does not own:
 * a component reaches its vocabulary through the log (`BrowserLog.signalFor`), which is built over
 * what the packages in the process contributed, and the port's own attacher composes the same list
 * first — so one declaration reaches a handler and a component alike (@@D-918).
 */
const vocabulary: IVocabulary = contribute({
    log: {
        /** The login endpoint answered without a token, so nothing can be signed in. */
        browserLoginTokenMissing: {
            level: 'warn',
            message: 'login response carried no access_token: {response}',
            mtid: 'event',
            method: 'auth.login',
        },
        /** The login call itself failed — a rejected credential, or a binding that is not there. */
        browserLoginCallFailed: {
            level: 'warn',
            message: 'login call failed: {errorType}: {errorMessage}',
            mtid: 'event',
            method: 'auth.login',
        },
        /** A model states a page it cannot build, and the page is registered anyway. */
        browserModelIncomplete: {
            level: 'warn',
            message: 'model warning: {warning}',
        },
    },
});

export default vocabulary;
