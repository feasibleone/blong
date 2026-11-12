/**
 * The order a list table starts in.
 *
 * A model declares its browse order in `listParams.orderBy` — that is where the
 * generated table puts the name column — and the header has to show it, or the
 * reader cannot tell whether the rows are in their order or the model's. This
 * covers the two spellings the framework accepts and the cases that mean "no
 * order".
 */
import {describe, expect, it} from 'vitest';
import {sortFromParams} from './useTableList.js';

describe('sortFromParams', () => {
    it('reads the browser shape the model generates', () => {
        expect(sortFromParams({orderBy: [{field: 'sportName', dir: 'ASC'}]})).toEqual({
            field: 'sportName',
            dir: 1,
        });
        expect(sortFromParams({orderBy: [{field: 'createdAt', dir: 'DESC'}]})).toEqual({
            field: 'createdAt',
            dir: -1,
        });
    });

    it('reads the knex-facing spelling', () => {
        expect(sortFromParams({orderBy: [{column: 'sportName', order: 'desc'}]})).toEqual({
            field: 'sportName',
            dir: -1,
        });
    });

    it('takes a single term as well as an array', () => {
        expect(sortFromParams({orderBy: {field: 'legalName'}})).toEqual({
            field: 'legalName',
            dir: 1,
        });
    });

    it('defaults the direction to ascending', () => {
        expect(sortFromParams({orderBy: [{field: 'code', order: 'asc'}]})?.dir).toBe(1);
    });

    it('reports no order when the params declare none', () => {
        expect(sortFromParams(undefined)).toBeNull();
        expect(sortFromParams({})).toBeNull();
        expect(sortFromParams({orderBy: []})).toBeNull();
        expect(sortFromParams({orderBy: [{dir: 'ASC'}]})).toBeNull();
        expect(sortFromParams({paging: {pageSize: 25}})).toBeNull();
    });
});
