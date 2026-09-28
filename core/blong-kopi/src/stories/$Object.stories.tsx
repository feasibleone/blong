import {page} from '@feasibleone/blong-browser/storyHelper';
import type {Meta} from '@storybook/react-vite';

const meta: Meta = {
    title: '$Subject/$Object',
    parameters: {layout: 'fullscreen'},
};
export default meta;

/** Browse — the $Object list with its toolbar. */
export const Browse = page('$subject.$object.browse');
/** Open — record 1, which meta/fixture/$subjectFixture.ts carries. */
export const Open = page('$subject.$object.open', 1);
/** New — the empty create form. */
export const New = page('$subject.$object.new');
/** Report — the read-only view. */
export const Report = page('$subject.$object.report');
