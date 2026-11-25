import t from 'tap';

import {engineDispatchResult} from './engine.ts';

/**
 * What a kind reads off a dispatch (`@@T-823`).
 *
 * The adapter hands a `native` engine one `dispatch` for its custom tools, and a local request answers
 * with the pair the framework packs a decoded result into: the handler's value first, its meta second.
 * A kind that read `result` off the pair found nothing and answered the model with its own fallback —
 * a question put to a person came back as `{ok: true}` while the person's answer sat in the first
 * element.
 */

t.test('the framework envelope comes off a dispatched answer', async t => {
    t.same(
        engineDispatchResult([
            {result: {promptId: 'p-1', answerText: 'yes'}},
            {method: 'agent.tool.run', mtid: 'response'},
        ]),
        {result: {promptId: 'p-1', answerText: 'yes'}},
        'the payload is the first element of the pair',
    );
    t.same(
        engineDispatchResult({result: {finished: true}}),
        {result: {finished: true}},
        'an answer that is not the pair is handed over as it came',
    );
    t.same(
        engineDispatchResult(['a', 'b']),
        ['a', 'b'],
        'and so is a handler that returned a pair of its own',
    );
    t.same(
        engineDispatchResult([{done: true}, {method: 'x'}]),
        [{done: true}, {method: 'x'}],
        'a second element that is not a response meta is not an envelope',
    );
    t.same(engineDispatchResult(undefined), undefined, 'nothing stays nothing');
    t.end();
});
