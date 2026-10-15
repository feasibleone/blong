/**
 * The components a docs page or a blog post may use without importing them.
 *
 * One addition so far: `<StorybookStory>`, which renders a story from a published Storybook
 * (`docs/blong/storybook-sites.json`, staged by `blong-dev docs storybook`). Registering it here
 * rather than importing it per page is what keeps an embedded story a one-line markdown concern —
 * a page that would have to open with an import is a page an author is less likely to add one to.
 */

import StorybookStory from '@site/src/components/StorybookStory';
import MDXComponents from '@theme-original/MDXComponents';

export default {
    ...MDXComponents,
    StorybookStory,
};
