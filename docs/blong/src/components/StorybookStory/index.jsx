/**
 * A story from a published Storybook, rendered live in the page.
 *
 * The published Storybooks are built from `docs/blong/storybook-sites.json` and staged into
 * `docs/blong/static/storybook/<name>/` by `blong-dev docs storybook`, so an embed is a frame onto
 * the docs site's own origin — no cross-site frame policy to negotiate, no second deploy to
 * forget, and the same URL in `npm start`, in `npm run serve` and on the published site.
 *
 * Usage in a docs page or a blog post:
 *
 *     <StorybookStory site="browser" id="editor--toolbar" title="The editor toolbar" />
 *
 * Available without an import: `src/theme/MDXComponents.jsx` registers the tag for every MDX page,
 * docs and blog alike. The blong-docs skill documents when to reach for one.
 */

import useBaseUrl from '@docusaurus/useBaseUrl';
import { useState } from 'react';

import styles from './styles.module.css';

/** Id of the style tag injected into a loaded frame, so a re-render does not add a second one. */
const DEVTOOLS_STYLE_ID = 'blong-docs-embed-style';

/**
 * Styling a live frame has to happen inside it, and an embed is same-origin by design — the staged
 * tree is served from the site's own `/storybook/` — so the one devtool the stories carry is hidden
 * here, exactly as the docs captures hide it before photographing a story
 * (`core/blong-browser/test/docs.play.ts`). The Form Inspector is a rail on the right of every
 * blong-browser story: useful while developing one, and in a page it reads as part of the feature.
 *
 * Every step is guarded: if the frame were ever served from another origin, `contentDocument` is
 * null and the embed simply keeps the story it was given.
 */
function hideStorybookDevtools(frame) {
    try {
        const doc = frame?.contentDocument;
        if (!doc || doc.getElementById(DEVTOOLS_STYLE_ID)) return;
        const style = doc.createElement('style');
        style.id = DEVTOOLS_STYLE_ID;
        style.textContent = '.blong-inspector{display:none!important}';
        doc.head?.appendChild(style);
    } catch {
        // Another origin: the frame is not ours to restyle, and the story is still the story.
    }
}

/**
 * @param {object} props
 * @param {string} props.site Name of a site in `docs/blong/storybook-sites.json`, e.g. `browser`.
 * @param {string} props.id Story id as the URL carries it, e.g. `editor--toolbar`.
 * @param {string} [props.title] Caption under the frame, and the frame's accessible name.
 * @param {string} [props.height] Frame height, a CSS length. Defaults to 480px, or 640px with the
 *   full Storybook UI.
 * @param {string} [props.globals] Storybook globals to open the story from, e.g. `theme:wood` — the
 *   same list a Storybook URL takes, and it outranks the choices a reader's browser has stored.
 *   This is how a page shows one story in another theme, language or direction.
 * @param {boolean} [props.chrome] Show Storybook's own UI — the sidebar and the toolbar — instead
 *   of the bare story canvas.
 * @param {string} [props.poster] A picture to show until the reader asks for the live story: the
 *   frame then opens on a click @@D-558. Pass the page's committed screenshot —
 *   `poster={require('./img/page.png').default}` — so a page whose Storybook was never staged still
 *   shows a picture instead of an empty frame. The `require` is not decoration: an image is in the
 *   build only when something imports it, so a plain relative path here is a request for a file the
 *   build never wrote @@F-535.
 */
export default function StorybookStory({
    site,
    id,
    title,
    height,
    globals,
    chrome = false,
    poster,
}) {
    if (!site || !id) {
        throw new Error(
            `<StorybookStory> needs a site and a story id — got site="${site}" id="${id}". ` +
                'The sites are the `name` fields of docs/blong/storybook-sites.json and a story id ' +
                'is the one the published Storybook carries in its URL.',
        );
    }

    // A reader who pasted a whole query string is not punished for the leading separator.
    const overrides = typeof globals === 'string' ? globals.replace(/^[?&]/, '') : '';
    const query = overrides === '' ? '' : `&globals=${encodeURIComponent(overrides)}`;
    const frameHeight = height ?? (chrome ? '640px' : '480px');

    // The poster is the picture, at the picture's own shape: a fixed height with `object-fit: cover`
    // cut the left and right off every wide screenshot on the site, which is how a poster stopped
    // being the page it claimed to show. The frame's height applies to the live story, which has to
    // be given one.
    // The bare story: `iframe.html` renders the canvas alone, without the sidebar, the toolbar or
    // the docs addon's panels. A page that wants the toolbar asks for `chrome`.
    const storyUrl = useBaseUrl(
        `/storybook/${site}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story${query}`,
    );
    // Storybook's own UI, which is the only place the story toolbar lives — a page that documents
    // the toolbar links here rather than trying to embed a frame inside a frame.
    const managerUrl = useBaseUrl(
        `/storybook/${site}/?path=/story/${encodeURIComponent(id)}${query}`,
    );

    const [live, setLive] = useState(!poster);
    const caption = title ?? `Storybook story ${id}`;

    return (
        <figure className={styles.story} data-storybook-site={site} data-storybook-id={id}>
            {live ? (
                <iframe
                    className={styles.frame}
                    style={{height: frameHeight}}
                    src={chrome ? managerUrl : storyUrl}
                    title={caption}
                    loading="lazy"
                    onLoad={event => hideStorybookDevtools(event.currentTarget)}
                    allowFullScreen
                />
            ) : (
                <button
                    type="button"
                    className={styles.poster}
                    onClick={() => setLive(true)}
                    aria-label={`Load the live story: ${caption}`}
                >
                    {/* Not lazy: the poster's box is the picture's own height, and an image
                        that is not fetched has no height, so a lazy one is never in view and is
                        never fetched — the whole poster collapsed to zero. */}
                    <img className={styles.image} src={poster} alt={caption} decoding="async" />
                    <span className={styles.load}>Load the live story</span>
                </button>
            )}
            <figcaption className={styles.caption}>
                <span>{title}</span>
                <a className={styles.open} href={managerUrl} target="_blank" rel="noreferrer">
                    Open in Storybook
                </a>
            </figcaption>
        </figure>
    );
}
