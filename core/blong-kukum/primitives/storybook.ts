import {capitalize, checkSubject, type PrimitiveDescriptor} from '../engine.ts';

/** `storybook` — Storybook config and stories built on the shared factories. */

const storybook: PrimitiveDescriptor = {
    id: 'storybook',
    title: 'Storybook',
    skill: 'storybook-v10-setup',
    summary: 'Storybook config and stories using the shared blong factories/decorators.',
    kinds: ['main', 'preview', 'story'],
    defaultKind: 'story',
    roots: ['.storybook', 'src/stories'],
    check(ctx) {
        return checkSubject(ctx.subject);
    },
    files(ctx) {
        switch (ctx.kind) {
            case 'main':
                return [
                    {
                        path: '.storybook/main.ts',
                        content: `import {defineBlongStorybookMain} from '@feasibleone/blong-browser/storybookMain';

export default defineBlongStorybookMain({
    stories: ['../src/**/*.stories.@(ts|tsx)'],
});
`,
                    },
                ];
            case 'preview':
                return [
                    {
                        path: '.storybook/preview.tsx',
                        content: `import {withBlong} from '@feasibleone/blong-browser/storyHelper';
import type {Preview} from '@storybook/react';

const preview: Preview = {
    decorators: [withBlong()],
};

export default preview;
`,
                    },
                ];
            default:
                return [
                    {
                        path: `src/stories/${capitalize(ctx.object)}.stories.tsx`,
                        content: `import type {Story} from '@storybook/react';
import {${capitalize(ctx.object)}} from '../components/${capitalize(ctx.object)}';

export default {title: '${ctx.subject}/${capitalize(ctx.object)}'};

export const Default: Story = {args: {}};
`,
                    },
                ];
        }
    },
};

export default storybook;
