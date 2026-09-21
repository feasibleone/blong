import {useEffect, useState} from 'react';
import {useThemePalette} from '../../components/Theme/Theme.js';
import type {IDiagramRendererProps} from './rendererRegistry.js';

/**
 * Mermaid, rendered in the browser.
 *
 * What follows is deliberate, and each point is one a later reader would otherwise
 * "simplify" back into a defect:
 *
 * - **Only its own text is trusted, and even that is sanitised.** Mermaid runs
 *   with `securityLevel: 'strict'`, and the labels arriving here have already
 *   been made label-safe where they were written (see the service's renderer).
 *   A diagram drawn from another process's messages is not a place to be
 *   relaxed about markup.
 * - **A diagram that cannot be drawn is shown, not swallowed.** Mermaid throws
 *   on a notation it does not recognise; the answer is the text as it came,
 *   because a broken diagram the reader can see is evidence and a blank panel is
 *   not.
 * - **Mermaid is loaded when a diagram is drawn, not when the library is
 *   imported.** It is a large parser for a feature most pages never show, so it
 *   stays out of the bundle until something needs it.
 * - **Every render attempt gets its own element id.** Mermaid draws into an element
 *   it finds by id, so a second attempt that reuses the first one's id draws into the
 *   element React is already showing — and it resolves with an *empty* svg, which the
 *   setState below then wrote over a perfectly good diagram: a capture-time race that
 *   produced a zero-height element carrying the text and none of the drawing (F-202).
 *   The dependency list can re-run the effect (a theme change does), so "once per
 *   component instance" was not the same thing as "once per render".
 * - **What mermaid leaves behind is cleaned up, because nothing else will.** Handed an
 *   id and no element to draw into, mermaid builds its own `d<id>` wrapper on
 *   `document.body` and removes it only when the render *succeeds*; every failure path
 *   abandons it, error drawing and all, under an id nothing will ever reuse. A page that
 *   kept one per attempt grew until Chromatic refused to capture it — 1,172x73,509px,
 *   past its 25,000,000px limit (F-213). The id is this component's, so the sweep is
 *   too, and mermaid is asked to suppress its own error rendering: the fallback below
 *   already shows the reader the text.
 * - **Nothing is drawn for nothing.** An empty diagram is not an empty render — mermaid
 *   parses first, and `''` is a parse failure — so asking it to draw one spends an
 *   attempt, a temporary element and a console error to learn what the render below
 *   already knows.
 * - **Its colours are the page's.** The theme comes from the palette in force, not from
 *   a preference of the diagram's own: a diagram in a mode the surrounding page is not
 *   in reads as pasted in, and the earlier reading of the dark-mode hook — an object,
 *   always truthy, so "dark" whatever the page said (F-216) — was a coincidence that
 *   held only while every surface happened to be dark.
 */
/** The theme mermaid was last initialised with; `mermaid.initialize` is global. */
let appliedTheme: string | undefined;
let sequence = 0;

/** What has been drawn for one diagram, or how drawing it failed. */
interface IRenderState {
    diagram: string;
    svg?: string;
    failed?: boolean;
}

export default function MermaidRenderer({diagram, className}: IDiagramRendererProps) {
    // The palette the page is showing, from the theme system — the portal's palette and
    // `Theme`'s own default of `dark`. Outside a `<Theme>` there is no page to match, and
    // the platform's default is what the app config, the portal's `DEFAULT_THEME` and
    // every story decorator already pass, so that is what an unmatched diagram draws in
    // (D-238).
    //
    // A primitive, and deliberately: this is an effect dependency, a dependency is
    // compared by identity, and an object here re-ran the effect after every render —
    // one diagram draw per pass, in a page that never settles (F-212).
    const isDark = (useThemePalette() ?? 'dark') === 'dark';
    const [state, setState] = useState<IRenderState>(() => ({diagram}));

    useEffect(() => {
        if (diagram.length === 0) return;
        let cancelled = false;
        void (async (): Promise<void> => {
            // Allocated before the load, because the cleanup below needs it even if
            // the import is what failed.
            const id = `blong-diagram-${(sequence += 1)}`;
            try {
                const mermaid = (await import('mermaid')).default;
                const theme = isDark ? 'dark' : 'neutral';
                // Only when the theme actually changed: `initialize` sets global
                // configuration, and honouring the theme by initialising once left a
                // diagram drawn in the palette the page was in when it first appeared —
                // which the theme switcher changes at runtime, so this is the normal
                // path rather than a hypothetical one (D-235).
                if (appliedTheme !== theme) {
                    mermaid.initialize({
                        startOnLoad: false,
                        securityLevel: 'strict',
                        suppressErrorRendering: true,
                        theme,
                    });
                    appliedTheme = theme;
                }
                const {svg} = await mermaid.render(id, diagram);
                if (cancelled) return;
                // A render that answers with nothing is a failed render, and it is said
                // so rather than written over the drawing: an element carrying the text
                // and no svg is a diagram that looks captured and is empty (F-191).
                setState(svg.length > 0 ? {diagram, svg} : {diagram, failed: true});
            } catch (error) {
                // Said out loud, not only drawn. The fallback shows the reader the
                // text; this line tells whoever has to fix it *why* mermaid refused —
                // a chunk that never loaded, a notation it does not know, a render
                // that threw. Without it, a failed diagram and a pending one are both
                // "an element that never appears", which is how a page that renders
                // nothing costs an afternoon.
                console.error('[blong] diagram render failed', {diagram, error});
                if (!cancelled) setState({diagram, failed: true});
            } finally {
                // Mermaid's working element, not this component's and not React's: it
                // is removed whatever mermaid did with it, and whatever happened here
                // (F-213). The rendered diagram is a *string* mermaid returned, injected
                // into the div below, so this can only ever remove the wrapper — never
                // the drawing. The iframe id is the sandboxed-security-level twin of the
                // same wrapper; `strict` does not create one, and removing an absent
                // node costs nothing.
                document.getElementById(`d${id}`)?.remove();
                document.getElementById(`i${id}`)?.remove();
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [diagram, isDark]);

    // Derived rather than reset in the effect: a diagram the state does not
    // describe is pending, whatever the state says about the previous one, so a
    // change of diagram needs no state of its own and no extra render pass.
    const current: IRenderState = state.diagram === diagram ? state : {diagram};

    if (current.failed || diagram.length === 0) {
        return (
            <pre
                className={className}
                data-diagram-fallback="true"
            >
                {diagram}
            </pre>
        );
    }
    if (current.svg === undefined) {
        return (
            <div
                className={className}
                data-diagram-pending="true"
            />
        );
    }
    return (
        <div
            className={className}
            data-diagram-rendered="true"
            // The source text stays reachable, because the two artifacts a diagram
            // is worth are the picture and the text: a spec can screenshot the
            // drawing and still write the mermaid it was drawn from, which an
            // injected SVG no longer contains.
            data-diagram-text={diagram}
            // Safe by construction, not by assumption: mermaid renders with
            // `securityLevel: 'strict'`, which sanitises the SVG it produces, and
            // the labels in it were sanitised where they were written.
            // cspell:disable-next-line -- the rule's name is not a word
            // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
            dangerouslySetInnerHTML={{__html: current.svg}}
        />
    );
}
