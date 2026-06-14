import {test} from 'tap';
import {mergeWithSymbols} from './index.ts';

test('deepMerge', t => {
    t.test('merges two flat objects', t => {
        const result = mergeWithSymbols({a: 1, b: 2}, {b: 3, c: 4});
        t.same(result, {a: 1, b: 3, c: 4});
        t.end();
    });

    t.test('merges nested objects recursively', t => {
        const result = mergeWithSymbols({x: {a: 1, b: 2}}, {x: {b: 99, c: 3}});
        t.same(result, {x: {a: 1, b: 99, c: 3}});
        t.end();
    });

    t.test('overwrites arrays (does not merge them)', t => {
        const result = mergeWithSymbols({items: [1, 2]}, {items: [3, 4, 5]});
        t.same(result, {items: [3, 4, 5]});
        t.end();
    });

    t.test('handles multiple sources', t => {
        const result = mergeWithSymbols({a: 1}, {b: 2, c: 3});
        t.same(result, {a: 1, b: 2, c: 3});
        t.end();
    });

    t.test('handles null/undefined source gracefully', t => {
        const result = mergeWithSymbols({a: 1}, undefined as never);
        t.same(result, {a: 1});
        t.end();
    });

    t.test('handles null values in source', t => {
        const result = mergeWithSymbols({a: 1, b: {x: 1}}, {b: null as never});
        t.equal(result.b, null);
        t.end();
    });

    t.end();
});
