/**
 * The realm's declared vocabulary (`@@T-717`).
 *
 * What these assertions pin is the property the move out of `error/error.ts` was for: a declared message
 * *interpolates* the values its call supplies. The old map wrote `?sessionId?` and relied on the factory
 * to substitute it at throw time, so a message that named a value nothing supplied printed the placeholder
 * and nobody noticed — the declaration could not check the call. Here a message's placeholders are checked
 * when it is called, and this test proves the substitution happens for the four messages a reader most
 * depends on: the id has to be in the sentence, or an operator reading a 404 cannot tell which session
 * was missing.
 */

import {render} from '@feasibleone/lukaot';
import {test} from 'tap';

import vocabulary from '../lukaot/error.ts';

/** The declared entries, by identifier. */
const declared = vocabulary.declared.error as Record<
    string,
    {message: string; statusCode?: number}
>;

test('every error the realm declares keeps its status code', async t => {
    const codes = Object.fromEntries(
        Object.entries(declared).map(([id, entry]) => [id, entry.statusCode]),
    );
    t.equal(codes.agentSessionNotFound, 404);
    t.equal(codes.agentSessionSuspended, 409);
    t.equal(codes.agentTaskUnavailable, 503);
    t.equal(codes.agentStepLimitReached, 429);
    t.equal(codes.agentCommandDisabled, 403, 'a switched-off capability is not a server fault');
    t.equal(Object.keys(declared).length, 14, 'all fourteen survived the move');
    t.end();
});

test('the messages interpolate their parameters rather than printing a placeholder', async t => {
    for (const [id, entry] of Object.entries(declared)) {
        t.notMatch(entry.message, /\?\w+\?/, `${id} carries no legacy placeholder`);
    }
    // Interpolation itself, through the renderer the emitter uses: the sentence a reader gets has the
    // value in it, and a value the call did not supply is marked rather than dropped.
    t.equal(
        render(declared.agentSessionNotFound!.message, {sessionId: 's-42'}),
        'Session s-42 does not exist',
    );
    t.equal(
        render(declared.agentTicketNotClaimed!.message, {ticketId: 't-1', workerId: 'w-1'}),
        'Ticket t-1 is not claimed by worker w-1',
    );
    t.match(
        render(declared.agentQuestionTimeout!.message, {promptId: 'p-1', timeoutMs: 30_000}),
        /p-1 was not answered within 30000 ms/,
    );
    t.match(
        render(declared.agentWorkspaceEscape!.message, {requestedPath: '../etc', ticketId: 't-2'}),
        /\.\.\/etc leaves the workspace of ticket t-2/,
    );
    t.end();
});
