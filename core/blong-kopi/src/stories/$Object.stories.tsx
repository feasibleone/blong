import {page} from '@feasibleone/blong-browser/storyHelper';
import type {Meta} from '@storybook/react-vite';

const meta: Meta = {
    title: '$Subject/$Object',
    parameters: {layout: 'fullscreen'},
};
export default meta;

/** Browse — the $Object list with its toolbar. */
export const Browse = page('$subject.$object.browse');
/** Open — record 101, the first row `meta/dbTest/$subject$ObjectMerge.yaml`
 *  seeds and `meta/fixture/$subjectFixture.ts` mirrors, so it loads in both the
 *  mock and the live backend mode. */
export const Open = page('$subject.$object.open', 101);
/** New — the empty create form. */
export const New = page('$subject.$object.new');
/** Report — the read-only view. */
export const Report = page('$subject.$object.report');
