/**
 * The declaration grammar: what a vocabulary may say, and what a call to it may omit.
 *
 * The type assertions below are the ones that matter: `@ts-expect-error` on a call that leaves a
 * placeholder unsupplied means `tsc` is the test — remove the marker and the file stops compiling,
 * which is exactly the check the plan's Done-means line names.
 */

import {test} from 'tap';

import {
    clearContributed,
    compose,
    contribute,
    contributedVocabularies,
    declare,
    LEVEL_NAMES,
    normaliseMessage,
    type SignalVocabulary,
} from './declare.ts';

const declaration = declare({
    log: {
        agentTicketSkipped: {level: 'warn', message: 'ticket {ticketId} was not claimed: {reason}'},
        agentBusy: 'nothing to do',
    },
    error: {
        agentTicketNotFound: {message: 'Ticket {ticketId} is not in the pool', statusCode: 404},
    },
});

test('an entry keeps its identifier, its kind and its defaults', async t => {
    t.equal(declaration.signal['agentTicketSkipped']?.kind, 'log');
    t.equal(declaration.signal['agentTicketSkipped']?.level, 'warn');
    t.equal(declaration.signal['agentBusy']?.level, 'info', 'a log entry defaults to info');
    t.equal(declaration.signal['agentTicketNotFound']?.kind, 'error');
    t.equal(declaration.signal['agentTicketNotFound']?.level, 'error', 'an error records at error');
    t.end();
});

test('a string entry is an error with only a message', async t => {
    const declared = declare({error: {agentWorkspaceMissing: 'Path {requestedPath} is not here'}});
    t.equal(declared.signal['agentWorkspaceMissing']?.kind, 'error');
    t.equal(declared.signal['agentWorkspaceMissing']?.message, 'Path {requestedPath} is not here');
    t.end();
});

test('the question-mark spelling is normalised into braces', async t => {
    const declared = declare({
        error: {agentStepLimitReached: 'Session ?sessionId? hit ?maxSteps?'},
    });
    t.equal(
        declared.signal['agentStepLimitReached']?.message,
        'Session {sessionId} hit {maxSteps}',
        'the realm that writes ?name? keeps its wording and gains interpolation',
    );
    t.equal(normaliseMessage('no placeholders'), 'no placeholders');
    t.end();
});

test('a dotted identifier is refused, with the key in the message', async t => {
    t.throws(
        () => declare({error: {'agent.ticket': 'not found'}}),
        /"agent\.ticket" is not an identifier/,
    );
    t.throws(() => declare({log: {'agent-ticket': 'not found'}}), /is not an identifier/);
    t.end();
});

test('an unknown kind, a duplicate and an unknown level are refused', async t => {
    t.throws(
        () => declare({metric: {agentCount: 'x'}} as unknown as Parameters<typeof declare>[0]),
        /"metric" is not a declaration kind/,
    );
    t.throws(() => declare({log: {agentBusy: 'x'}, error: {agentBusy: 'y'}}), /declared twice/);
    t.throws(
        () => declare({log: {agentBusy: {message: 'x', level: 'loud' as 'info'}}}),
        /not one of/,
    );
    t.same(LEVEL_NAMES.slice(0, 2), ['trace', 'debug']);
    t.end();
});

/** What the typed vocabulary handed back, so the assertion is not inside the declaration. */
let captured: {ticketId: string; reason: string} | undefined;

/** The vocabulary as a consumer sees it: one method per identifier, typed by its placeholders. */
type Vocabulary = SignalVocabulary<typeof declaration.declared>;

const vocabulary: Vocabulary = {
    agentTicketSkipped: params => {
        captured = params as {ticketId: string; reason: string};
    },
};

test('a call supplies every placeholder, and the compiler enforces it', async t => {
    type Declared = typeof declaration.declared;
    const call = (
        params: Parameters<NonNullable<SignalVocabulary<Declared>['agentTicketSkipped']>>,
    ) => params;
    t.same(call([{ticketId: 't1', reason: 'asked'}]), [{ticketId: 't1', reason: 'asked'}]);

    type Missing = Parameters<NonNullable<SignalVocabulary<Declared>['agentTicketSkipped']>>[0];
    // @ts-expect-error — a placeholder the call does not supply is a compile error
    const missing: Missing = {ticketId: 't1'};
    t.ok(missing, 'the marker above is what proves the check');
    vocabulary.agentTicketSkipped?.({ticketId: 't1', reason: 'asked'});
    t.same(captured, {ticketId: 't1', reason: 'asked'}, 'the parameter is typed by the message');
    t.end();
});

test('a declaration announces its kind to the loader', async t => {
    // The marker is the framework's own: `Symbol.for('blong:kind')` is one symbol across every copy
    // of every package, so the loader classifies a declaration as `object:vocabulary` and registers
    // it — without lukaot importing anything from `blong`, which would reverse the dependency.
    const marker = Symbol.for('blong:kind');
    t.equal((declaration as unknown as Record<symbol, unknown>)[marker], 'vocabulary');
    t.notOk(
        Object.keys(declaration).includes(String(marker)),
        'and it is not enumerable, so it never reaches a JSON payload or a snapshot',
    );
    t.ok(declaration.signal, 'the declaration still carries the map the proxy is built from');
    t.end();
});

test('a package contributes names to every port in the process', t => {
    // A library owns no port: `blong-mock`'s handlers run on whichever realm attached them. What it
    // declares at module load is composed into the vocabulary of every port, which is the difference
    // between a library reporting and a library asking its host to copy its names (`@@D-918`).
    clearContributed();
    const library = contribute({
        log: {mockCallAnswered: {level: 'debug', message: 'mock answered {predicate}'}},
    });
    t.equal(contributedVocabularies().length, 1, 'the declaration is contributed once');
    t.equal(contributedVocabularies()[0], library as never, 'and it is the same vocabulary');

    const realm = declare({log: {agentTicketClaimed: {level: 'info', message: 'claimed'}}});
    const composed = compose(...contributedVocabularies(), realm);
    t.ok(composed.signal.agentTicketClaimed, 'the realm’s own names are still there');
    t.ok(composed.signal.mockCallAnswered, 'and the library’s arrive beside them');

    // Two declarations of one name are refused where they always were, whether both are a package's
    // or one is the realm's.
    t.throws(
        () =>
            compose(
                ...contributedVocabularies(),
                declare({log: {mockCallAnswered: {level: 'info', message: 'mine'}}}),
            ),
        /declared twice/,
        'a host may not redeclare a library’s name',
    );
    clearContributed();
    t.equal(contributedVocabularies().length, 0, 'and a test can take the contribution away again');
    t.end();
});
