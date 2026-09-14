import t from 'tap';
import {bindInboundLeg, bindLeg, bindTrace, withFlow} from './context.ts';
import {identityHeaders, readIdentities, TRACE_HEADER} from './propagation.ts';

const FLOW_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const FLOW_KIND = 'transfer.single';
const LEG = 'payer.quote.rates';

t.test('only the identities that are bound are propagated, in one header', async t => {
    t.same(identityHeaders(), {}, 'a scope handed no identity sends none');
    await bindTrace('tr-1', async () => {
        t.same(identityHeaders(), {[TRACE_HEADER]: 'trace=tr-1'}, 'a trace alone travels alone');
        await withFlow({id: FLOW_ID, kind: FLOW_KIND}, async () => {
            t.equal(
                identityHeaders()[TRACE_HEADER],
                `trace=tr-1,flow=${FLOW_ID}`,
                'the execution id joins it — the ULID, never the kind, which is a deployment property',
            );
            await bindLeg({id: LEG, to: 'hub'}, async () => {
                t.equal(
                    identityHeaders()[TRACE_HEADER],
                    `trace=tr-1,flow=${FLOW_ID},leg=${LEG},to=hub,seq=1`,
                    'a declared call adds its id, the receiver it expects and its position',
                );
            });
            t.notMatch(
                identityHeaders()[TRACE_HEADER] ?? '',
                /leg=/,
                'and all three are gone once the call returns',
            );
        });
    });
});

t.test(
    'an adopted leg propagates what it was handed, without a declaration of its own',
    async t => {
        await withFlow({id: FLOW_ID, kind: FLOW_KIND}, async () => {
            await bindInboundLeg({id: LEG, seq: '2'}, async () => {
                // No `to`: the receiver is the one that was aimed at, and restating it
                // would read as a declaration made here.
                t.equal(identityHeaders()[TRACE_HEADER], `flow=${FLOW_ID},leg=${LEG},seq=2`);
            });
        });
    },
);

t.test('transport headers merge without displacing an identity', async t => {
    await bindTrace('tr-2', async () => {
        t.same(identityHeaders({'content-type': 'application/json'}), {
            [TRACE_HEADER]: 'trace=tr-2',
            'content-type': 'application/json',
        });
    });
});

t.test('nothing is minted for an identity that was never bound (R9)', t => {
    // The library mints no identity implicitly. Handing the other end a value the
    // sender never chose would be the same class of lie as a fabricated flow id, so
    // an unbound identity is simply absent and the receiver mints its own.
    t.same(identityHeaders({accept: 'application/json'}), {accept: 'application/json'});
    t.end();
});

t.test('readIdentities reads the fields it knows and ignores the rest', t => {
    t.same(readIdentities({}), {}, 'an absent header names nothing');
    t.same(readIdentities({[TRACE_HEADER]: ''}), {}, 'a blank one too');
    t.same(
        readIdentities({[TRACE_HEADER]: 'tr-1'}),
        {trace: 'tr-1'},
        'a bare trace id: the form this header had before the leg existed',
    );
    t.same(
        readIdentities({[TRACE_HEADER]: `trace=tr-1,flow=${FLOW_ID},leg=${LEG},to=hub,seq=1`}),
        {trace: 'tr-1', flow: FLOW_ID, leg: LEG, to: 'hub', seq: '1'},
        'the whole group',
    );
    t.same(
        readIdentities({[TRACE_HEADER]: 'future=x,trace=tr-1'}),
        {trace: 'tr-1'},
        'a field this version does not know is ignored rather than fatal, so a newer emitter still reaches it',
    );
    t.same(
        readIdentities({[TRACE_HEADER]: 'trace'}),
        {trace: 'trace'},
        'a bare value is still a trace',
    );
    t.end();
});

t.test('a value that is not one identity list is read as no identity at all', t => {
    // A duplicated header line arrives joined by a comma, so the field repeats. Half
    // reading it would carry a corrupt identity onward, which is worse than none —
    // and `tr-1,tr-2`, the old joined form of two trace headers, is exactly that case.
    t.same(readIdentities({[TRACE_HEADER]: 'trace=tr-1,trace=tr-2'}), {}, 'a repeated field');
    t.same(readIdentities({[TRACE_HEADER]: 'tr-1,tr-2'}), {}, 'two bare values');
    t.same(readIdentities({[TRACE_HEADER]: 'trace='}), {}, 'an empty value');
    t.same(readIdentities({[TRACE_HEADER]: '=tr-1'}), {}, 'no field name');
    t.same(readIdentities({[TRACE_HEADER]: 42}), {}, 'not a string');
    t.end();
});
