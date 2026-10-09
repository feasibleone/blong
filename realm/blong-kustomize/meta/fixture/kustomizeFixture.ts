import {handler} from '@feasibleone/blong';

/**
 * meta/fixture/kustomizeFixture.ts — sample rows for Storybook and the browser mock.
 *
 * A plain `handler()` named `kustomizeFixture`: the mock adapter matches this folder's
 * group and reads the data by calling `blong.handler['kustomizeFixture']`. It must NOT
 * use the `fixture()` factory — that one describes mock OpenAPI subjects and dropdowns, a
 * different shape.
 *
 * `browser.ts` globs this folder, and a fixture the browser platform never loads leaves
 * every story empty. The realm has no database, so unlike a CRUD scaffold there is no seed
 * for these rows to mirror: they are the only sample data there is, which is why the
 * statuses are the two values `kustomize.deployment.find` can produce (`ready` when the
 * Deployment has available replicas, `pending` while it does not).
 *
 * Keep a row keyed 101: the Open story in `src/stories/Deployment.stories.tsx` opens it.
 */
export default handler(
    () =>
        async function kustomizeFixture() {
            return {
                'kustomize.deployment': [
                    {
                        deploymentId: 101,
                        deploymentName: 'Sample Deployment One (fixture)',
                        deploymentStatus: 'ready',
                        createdAt: '2026-10-04T09:12:00Z',
                    },
                    {
                        deploymentId: 102,
                        deploymentName: 'Sample Deployment Two (fixture)',
                        deploymentStatus: 'pending',
                        createdAt: '2026-10-04T09:15:00Z',
                    },
                ],
            };
        },
);
