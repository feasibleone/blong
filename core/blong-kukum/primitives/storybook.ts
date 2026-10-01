import {
    capitalize,
    checkObject,
    checkSubject,
    type PrimitiveContext,
    type PrimitiveDescriptor,
    type PrimitiveFile,
} from '../engine.ts';
import {appendChildFolder, readPlainSource} from '../merge.ts';

/**
 * `storybook` — Storybook config and the realm stories.
 *
 * Four kinds, one per artifact:
 *  - `main`    — `.storybook/main.ts`, via the shared `defineBlongStorybookMain` factory.
 *  - `preview` — `.storybook/preview.tsx`, the one-line `defineBlongStorybookPreview(browser,
 *                {backend: true})` factory call that loads the browser platform (and the mock
 *                adapter) around every story and installs the story toolbar.
 *  - `story`   — `src/stories/<Object>.stories.tsx`, Browse/Open/New/Report stories for the
 *                entity's model pages, via the shared `page()` helper.
 *  - `portal`  — `src/stories/<Subject>.stories.tsx`, the whole portal shell via `portal()`.
 *
 * The story is a MODEL-page story on purpose: a realm's React pages are produced by the model
 * system, so `page('subject.object.browse')` is what a generic generator can render — a
 * `component` handler is a server-side handler, not a component, and no story can import it.
 *
 * A model story is not self-contained: the pages render through the mock adapter, which reads its
 * sample rows from the realm's `meta/fixture/<subject>Fixture` handler, and the browser platform
 * loads a realm only through the children `browser.ts` lists. So `compose` splices the fixture
 * folder into that entry (extending a hand-written list — `composed` allows it, because a splice
 * cannot lose what the file already holds), and the result carries a notice for the half a
 * generator cannot produce: the fixture itself belongs to the `model` primitive. The splice can
 * fail on a `browser.ts` that cannot be read or that lists no `./meta` folder; then, and only
 * then, the notice also says to register the folder by hand.
 *
 * Two imports are deliberate and easy to get wrong:
 *  - `withBlong` is the DEFAULT export of `@feasibleone/blong-browser/storybook.tsx`;
 *    `storyHelper` exports `page`/`portal` and has no `withBlong`.
 *  - `preview.tsx` composes the entry that carries the portal port (T-162): in a realm that is
 *    `../index.browser.ts`, because the realm's own `browser.ts` has no `ui.portal`; a suite's
 *    `browser.ts` already is the composed entry.
 *
 * Every file this primitive writes also exists in the scaffolding template
 * (`core/blong-kopi/.storybook/` and `core/blong-kopi/src/stories/`), which a scaffolded realm
 * receives verbatim — it is the same text with the dollar tokens. **Change the two together**:
 * `engine.test.ts` compares this descriptor's output against the template on every run and fails
 * on any difference, so the pair cannot drift apart unnoticed (they had, in both directions,
 * before that test existed).
 */

/** The folder the mock adapter reads its sample rows from, as `browser.ts` lists it. */
const FIXTURE_FOLDER = './meta/fixture';

/** The realm entry a model story needs the fixture registered in. */
const BROWSER_ENTRY = 'browser.ts';

/** The file list of one kind, written without knowing the realm it lands in. */
function storyFiles(ctx: PrimitiveContext): PrimitiveFile[] {
    const Entity = capitalize(ctx.object);
    switch (ctx.kind) {
        case 'main':
            return [
                {
                    path: '.storybook/main.ts',
                    content: `import {defineBlongStorybookMain} from '@feasibleone/blong-browser/storybookMain';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * ${ctx.subject} Storybook configuration.
 *
 * Stories are discovered in \`src/stories/\`. To render another realm's stories
 * beside this one, pass \`realmPackages: ['@feasibleone/<realm>']\` — the helper
 * resolves each package's story paths for you.
 */
export default defineBlongStorybookMain({importMetaDirname: __dirname});
`,
                },
            ];
        case 'preview':
            return [
                {
                    path: '.storybook/preview.tsx',
                    content: `import {defineBlongStorybookPreview} from '@feasibleone/blong-browser/storybook.tsx';
// The composed entry, not \`../browser.ts\`: a model story needs the portal port
// (blong-browser), which only the composed entry carries. A realm's composed
// entry is \`index.browser.ts\`; a suite's \`browser.ts\` already is one.
import browser from '../index.browser.ts';

// One line on purpose.  The factory owns the toolbar — backend (mock / live
// JSON-RPC / live MLE), role, theme, language, direction — plus its persistence
// and the decorators that apply them, so every realm's preview (and the kukum
// template that generates it) is this same line.  \`backend: true\` adds the
// Backend and Role items: these stories run on the loaded platform, so there is
// a backend adapter to point at a gateway.
export default defineBlongStorybookPreview(browser, {backend: true});
`,
                },
            ];
        case 'portal':
            return [
                {
                    path: `src/stories/${capitalize(ctx.subject)}.stories.tsx`,
                    content: `import {portal} from '@feasibleone/blong-browser/storyHelper';
import type {Meta} from '@storybook/react-vite';

const meta: Meta = {
    title: '${capitalize(ctx.subject)}/Portal',
    parameters: {layout: 'fullscreen'},
};
export default meta;

/** The whole portal shell — navigation, tabs and every page of the realm at once. */
export const ${capitalize(ctx.subject)} = portal();
`,
                },
            ];
        default:
            return [
                {
                    path: `src/stories/${Entity}.stories.tsx`,
                    content: `import {page} from '@feasibleone/blong-browser/storyHelper';
import type {Meta} from '@storybook/react-vite';

const meta: Meta = {
    title: '${capitalize(ctx.subject)}/${Entity}',
    parameters: {layout: 'fullscreen'},
};
export default meta;

/** Browse — the ${Entity} list with its toolbar. */
export const Browse = page('${ctx.subject}.${ctx.object}.browse');
/** Open — record 101, the first row \`meta/dbTest/${ctx.subject}${Entity}Merge.yaml\`
 *  seeds and \`meta/fixture/${ctx.subject}Fixture.ts\` mirrors, so it loads in both the
 *  mock and the live backend mode. */
export const Open = page('${ctx.subject}.${ctx.object}.open', 101);
/** New — the empty create form. */
export const New = page('${ctx.subject}.${ctx.object}.new');
/** Report — the read-only view. */
export const Report = page('${ctx.subject}.${ctx.object}.report');
`,
                    // The sample rows are a `model` artifact, so the caller is told to
                    // generate one — the story cannot do it and renders empty without it.
                    notices: [
                        `the stories read sample data from a '${ctx.subject}Fixture' handler: ` +
                            `generate one with \`kukum model add --subject=${ctx.subject} ` +
                            `--object=${ctx.object} --kind=fixture\`. The Open story opens ` +
                            `record 101, so the fixture must carry the same ids as the ` +
                            `'${ctx.subject}${Entity}Merge' test seed.`,
                    ],
                },
            ];
    }
}

/** Why `browser.ts` could not be extended, and what to do instead. */
function globNotice(reason: string): string {
    return (
        `${BROWSER_ENTRY} ${reason}, so '${FIXTURE_FOLDER}' could not be registered in its ` +
        `children: add '${FIXTURE_FOLDER}/**/*.ts' to the \`import.meta.glob\` list and ` +
        `'${FIXTURE_FOLDER}' to the non-window branch of the same ternary by hand — a folder the ` +
        'browser platform is not told about never loads, and every story renders empty.'
    );
}

const storybook: PrimitiveDescriptor = {
    id: 'storybook',
    title: 'Storybook',
    skill: 'storybook-v10-setup',
    summary:
        'Storybook config (main/preview) and the realm stories (model pages and the portal), ' +
        'built on the shared blong-browser factories/decorators and the `page()`/`portal()` ' +
        'helpers. A model story also registers the fixture folder in `browser.ts`.',
    kinds: ['main', 'preview', 'story', 'portal'],
    defaultKind: 'story',
    roots: ['.storybook', 'src/stories'],
    check(ctx) {
        return [...checkSubject(ctx.subject), ...checkObject(ctx.object)];
    },
    files: storyFiles,
    compose({host, root, context}) {
        const files = storyFiles(context);
        // Only a model story reads the fixture; the config files and the portal
        // shell render without one.
        if (context.kind !== 'story') return files;
        const story = files[0];
        if (!story) return files;
        const withNotice = (reason: string): PrimitiveFile[] => [
            {...story, notices: [...(story.notices ?? []), globNotice(reason)]},
        ];

        const browser = readPlainSource(host, root, BROWSER_ENTRY);
        if (browser === undefined) return withNotice('was not found under the target root');

        const spliced = appendChildFolder(browser, FIXTURE_FOLDER);
        if (spliced === undefined) return withNotice('lists no ./meta folder');
        // Already registered (the kopi template does): nothing to write, nothing
        // to explain.
        if (spliced === browser) return files;

        return [
            ...files,
            // The file's own content, one array entry longer — `composed` is what
            // tells `plan` that writing it cannot drop anything the realm wrote.
            {path: BROWSER_ENTRY, content: spliced, composed: true},
        ];
    },
};

export default storybook;
