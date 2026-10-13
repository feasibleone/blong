import {handler} from '@feasibleone/blong';

/**
 * meta/fixture/kustomizeFixture.ts — sample rows for Storybook and the browser mock, read by name as
 * a plain `handler()`; keep the row keyed 101 for the Open story.
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
