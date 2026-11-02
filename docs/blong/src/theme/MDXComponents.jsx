/**
 * The components a docs page or a blog post may use without importing them.
 *
 * `<StorybookStory>` renders a story from a published Storybook (`docs/blong/storybook-sites.json`,
 * staged by `blong-dev docs storybook`), and `<ArchifyDiagram>` frames an interactive architecture
 * diagram (`docs/blong/diagrams.json`, staged by `blong-dev docs diagram`). Registering them here
 * rather than importing them per page is what keeps an embed a one-line markdown concern — a page
 * that would have to open with an import is a page an author is less likely to add one to.
 */

import ArchifyDiagram from '@site/src/components/ArchifyDiagram';
import StorybookStory from '@site/src/components/StorybookStory';
import MDXComponents from '@theme-original/MDXComponents';

export default {
    ...MDXComponents,
    ArchifyDiagram,
    StorybookStory,
};
