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
 * leaves every story empty. The sample records mirror
 * meta/dbTest/$subject$ObjectMerge.yaml — same ids, same names plus a
 * `(fixture)` marker — because a story must load in both modes: the fixture
 * feeds the Storybook mock path and the seed feeds the database path, and the
 * marker is what makes the toolbar's Backend item visibly do something. The
 * Open story in src/stories/$Object.stories.tsx opens record 101, so keep a
 * row whose key is 101 here.
 */
export default handler(
    () =>
        async function $subjectFixture() {
            return {
                '$subject.$object': [
                    {
                        $objectId: 101,
                        $objectName: 'Sample $Object One (fixture)',
                        $objectStatus: 'draft',
                    },
                    {
                        $objectId: 102,
                        $objectName: 'Sample $Object Two (fixture)',
                        $objectStatus: 'sent',
                    },
                ],
            };
        },
);
