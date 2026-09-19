import {useEffect, useState} from 'react';
import {useDarkMode} from '../../hooks/useDarkMode.js';
import type {IDiagramRendererProps} from './rendererRegistry.js';

/**
 * Mermaid, rendered in the browser.
 *
 * Three properties are deliberate:
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
 */
let initialised = false;
let sequence = 0;

/** What has been drawn for one diagram, or how drawing it failed. */
interface IRenderState {
    diagram: string;
    svg?: string;
    failed?: boolean;
}

export default function MermaidRenderer({diagram, className}: IDiagramRendererProps) {
    const dark = useDarkMode();
    const [state, setState] = useState<IRenderState>(() => ({diagram}));

    useEffect(() => {
        let cancelled = false;
        void (async (): Promise<void> => {
            try {
                const mermaid = (await import('mermaid')).default;
                if (!initialised) {
                    mermaid.initialize({
                        startOnLoad: false,
                        securityLevel: 'strict',
                        theme: dark ? 'dark' : 'neutral',
                    });
                    initialised = true;
                }
                const {svg} = await mermaid.render(`blong-diagram-${(sequence += 1)}`, diagram);
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
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [diagram, dark]);

    // Derived rather than reset in the effect: a diagram the state does not
    // describe is pending, whatever the state says about the previous one, so a
    // change of diagram needs no state of its own and no extra render pass.
    const current: IRenderState = state.diagram === diagram ? state : {diagram};

    if (current.failed || diagram.length === 0) {
        return (
            <pre className={className} data-diagram-fallback="true">
                {diagram}
            </pre>
        );
    }
    if (current.svg === undefined) {
        return <div className={className} data-diagram-pending="true" />;
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
