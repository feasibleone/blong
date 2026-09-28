import {handler} from '@feasibleone/blong';

/**
 * meta/fixture/$subjectFixture.ts — sample rows for Storybook.
 *
 * A plain `handler()`, named $subjectFixture: the mock adapter matches this
 * folder's group ($subject.fixture) and reads the data by calling
 * `blong.handler['$subjectFixture']`. It must NOT use the `fixture()` factory —
 * that one describes mock OpenAPI subjects/dropdowns, a different shape.
 *
 * `browser.ts` globs this folder; a fixture the browser platform never loads
 * leaves every story empty. The sample names and statuses mirror
 * meta/dbTest/$subject$ObjectMerge.yaml, but the ids are this file's own: the
 * fixture feeds the Storybook mock path and the seed feeds the database path,
 * and the two are independent sources for the same sample records. The Open
 * story in src/stories/$Object.stories.tsx opens record 1, so keep a row whose
 * key is 1 here.
 */
export default handler(
    () =>
        async function $subjectFixture() {
            return {
                '$subject.$object': [
                    {
                        $objectId: 1,
                        $objectName: 'Sample $Object One',
                        $objectStatus: 'draft',
                    },
                    {
                        $objectId: 2,
                        $objectName: 'Sample $Object Two',
                        $objectStatus: 'sent',
                    },
                ],
            };
        },
);
