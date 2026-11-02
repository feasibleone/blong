/**
 * A published architecture diagram, rendered live in the page.
 *
 * Every diagram in `docs/blong/diagrams.json` is rendered to one self-contained HTML file and staged
 * into `docs/blong/static/diagrams/` by `blong-dev docs diagram`, so an embed is a frame onto the
 * docs site's own origin — no cross-site frame policy, no second deploy, and the same URL in
 * `npm start`, in `npm run serve` and on the published site. The viewer it frames is interactive:
 * pan and zoom, focus on a node, the route and reach cards, and a Live/Still control for motion.
 *
 * Usage in a docs page or a blog post:
 *
 *     <ArchifyDiagram
 *         slug="blong-architecture"
 *         title="Blong deployment architecture"
 *         height="620px"
 *         posterLight={require('./img/diagrams/blong-architecture-light.png').default}
 *         posterDark={require('./img/diagrams/blong-architecture-dark.png').default}
 *     />
 *
 * Available without an import: `src/theme/MDXComponents.jsx` registers the tag for every MDX page.
 *
 * The staged file is a build output and is not committed, so a page that passes a poster shows the
 * poster until the reader asks for the diagram. That keeps a plain `npm run build` — the CI shape —
 * honest: it renders the committed picture rather than an empty frame, and the reader is told what
 * the click gives them. A page that passes no poster frames the diagram directly, which is what a
 * preview during authoring wants.
 *
 * The two posters are both rendered and the site's own CSS shows one: `#gh-dark-mode-only` and
 * `#gh-light-mode-only` are the fragments `src/css/custom.css` switches on, the same trick the
 * hand-drawn pictures on the architecture page use. That keeps this component free of a theme hook —
 * and of the extra dependency one would need @@D-731.
 */

import useBaseUrl from '@docusaurus/useBaseUrl';
import {useState} from 'react';

import styles from './styles.module.css';

/**
 * @param {object} props
 * @param {string} props.slug Key in `docs/blong/diagrams.json`, which is also the staged file name.
 * @param {string} [props.title] Caption under the frame, and the frame's accessible name.
 * @param {string} [props.height] Frame height, a CSS length. Defaults to 620px.
 * @param {string} [props.posterLight] Picture shown until the reader asks for the diagram, light theme.
 * @param {string} [props.posterDark] The same picture for the dark theme.
 * @param {boolean} [props.linked] Show the poster as a link to the full diagram instead of framing it.
 *   A diagram drawn at a width where its labels would project below legibility inside the page is
 *   better opened with the whole browser than scaled into a column, and the reader still gets the
 *   picture that says what they are opening @@D-733.
 */
export default function ArchifyDiagram({
    slug,
    title,
    height = '620px',
    posterLight,
    posterDark,
    linked = false,
}) {
    if (!slug) {
        throw new Error(
            '<ArchifyDiagram> needs a slug — the key of an entry in docs/blong/diagrams.json, ' +
                'which is also the name the rendered file is staged under.',
        );
    }

    const caption = title ?? `Diagram ${slug}`;
    const src = useBaseUrl(`/diagrams/${slug}.html`);
    // A lone picture carries no fragment: one would hide it in the theme that fragment does not
    // match, and a poster that disappears for half the readers is worse than no theme switch.
    const themed = Boolean(posterLight && posterDark);
    const hasPoster = Boolean(posterLight ?? posterDark);
    const [live, setLive] = useState(!hasPoster);

    return (
        <figure className={styles.diagram} data-archify-slug={slug}>
            {linked ? (
                <a
                    className={styles.poster}
                    href={src}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open the interactive diagram: ${caption}`}
                >
                    {posterLight && (
                        <img
                            className={styles.image}
                            src={themed ? `${posterLight}#gh-light-mode-only` : posterLight}
                            alt={caption}
                        />
                    )}
                    {posterDark && (
                        <img
                            className={styles.image}
                            src={themed ? `${posterDark}#gh-dark-mode-only` : posterDark}
                            alt={caption}
                        />
                    )}
                </a>
            ) : live ? (
                <iframe
                    className={styles.frame}
                    style={{height}}
                    src={src}
                    title={caption}
                    loading="lazy"
                    allowFullScreen
                />
            ) : (
                <button
                    type="button"
                    className={styles.poster}
                    onClick={() => setLive(true)}
                    aria-label={`Load the interactive diagram: ${caption}`}
                >
                    {/* Not lazy: the poster's box is the picture's own height, and an image that
                        is not fetched has no height, so a lazy one is never in view and is never
                        fetched — the poster would collapse to nothing. */}
                    {posterLight && (
                        <img
                            className={styles.image}
                            src={themed ? `${posterLight}#gh-light-mode-only` : posterLight}
                            alt={caption}
                        />
                    )}
                    {posterDark && (
                        <img
                            className={styles.image}
                            src={themed ? `${posterDark}#gh-dark-mode-only` : posterDark}
                            alt={caption}
                        />
                    )}
                </button>
            )}
            <figcaption className={styles.caption}>
                <span>{caption}</span>
                <a className={styles.open} href={src} target="_blank" rel="noreferrer">
                    Open full screen
                </a>
            </figcaption>
        </figure>
    );
}
