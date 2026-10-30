import {test} from 'tap';
import {Type} from 'typebox';

import {positionalParams} from './Gateway.ts';

/**
 * A JSON-RPC `params` reaches a handler in the shape the method declares.
 *
 * A client that speaks positional JSON-RPC sends `params: [{…}]` — the shape this repository's own
 * `.http` collections use — while every handler here takes the object itself. The route accepts both
 * and normalises, so the two forms are one call and a method whose params *are* an array is left
 * alone.
 */
const params = Type.Object({name: Type.String()});

test('one positional param is the object a handler takes', t => {
    t.same(
        positionalParams(params, [{name: 'World'}]),
        {name: 'World'},
        'the array a plain client sends is unwrapped',
    );
    t.same(
        positionalParams(params, {name: 'World'}),
        {name: 'World'},
        'and the object form is what it already is',
    );
    t.end();
});

test('a method whose params are an array keeps its array', t => {
    const list = Type.Array(Type.String());
    t.same(
        positionalParams(list, ['a']),
        ['a'],
        'a single element is the value, not a position holding it',
    );
    t.same(positionalParams(list, ['a', 'b']), ['a', 'b'], 'and several stay several');
    t.end();
});

test('params that are neither are passed as they arrived', t => {
    t.equal(positionalParams(params, undefined), undefined, 'nothing stays nothing');
    t.same(positionalParams(params, []), [], 'an empty array is not one positional value');
    t.same(
        positionalParams(params, [{name: 'a'}, {name: 'b'}]),
        [{name: 'a'}, {name: 'b'}],
        'two positions are not a params object and are left for the schema to refuse',
    );
    t.end();
});
