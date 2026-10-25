/**
 * Sport / reference pages — the classifiers every other page points at.
 *
 * The fixture rows are the real Olympic programme (`meta/fixture/sportFixture.ts`).
 * `page(method, params)` is the model helper: a `.open` page takes the record key
 * as a param, a `.new` page takes nothing.
 */
import {page} from '@feasibleone/blong-browser/storyHelper';
import type {Meta} from '@storybook/react-vite';

const meta: Meta = {title: 'Sport/Reference', parameters: {layout: 'fullscreen'}};
export default meta;

export const SportBrowse = page('sport.sport.browse');
export const SportNew = page('sport.sport.new');
export const SportOpen = page('sport.sport.open', {sportId: 's1'});

export const DisciplineBrowse = page('sport.discipline.browse');
export const DisciplineNew = page('sport.discipline.new');
export const DisciplineOpen = page('sport.discipline.open', {disciplineId: 'd1'});

export const CategoryBrowse = page('sport.category.browse');
export const CategoryNew = page('sport.category.new');

export const CycleBrowse = page('sport.cycle.browse');
export const CycleNew = page('sport.cycle.new');

export const AreaBrowse = page('sport.area.browse');
export const AreaNew = page('sport.area.new');
