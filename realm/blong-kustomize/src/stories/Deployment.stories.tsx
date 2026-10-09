import {page} from '@feasibleone/blong-browser/storyHelper';
import type {Meta} from '@storybook/react-vite';

const meta: Meta = {
    title: 'Kustomize/Deployment',
    parameters: {layout: 'fullscreen'},
};
export default meta;

/** Browse — the Deployment list with the Reconcile toolbar over the fixture rows. */
export const Browse = page('kustomize.deployment.browse');
/** Open — record 101, the first row `meta/fixture/kustomizeFixture.ts` provides. */
export const Open = page('kustomize.deployment.open', 101);
/** Report — the read-only view of the same record. */
export const Report = page('kustomize.deployment.report');

// There is deliberately no New story: the realm has no `kustomize.deployment.add`, because
// a Deployment exists in the cluster rather than in a table, so an empty create form would
// show a page that cannot save anything.
