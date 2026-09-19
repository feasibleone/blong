import type React from 'react';

/**
 * Diagram renderer registry — maps a *notation* to the component that draws it.
 *
 * This is the seam the plan asks for: the realm publishes a diagram as text in
 * one notation (the service emits Mermaid today) and names the renderer in its
 * own config, so a second notation — a graph, a React Flow canvas — is a
 * registration here plus a config value there, with no change to the realm and
 * none to the pages.
 *
 * A registry rather than a switch in the viewer, and a name rather than a
 * component prop, because the thing that decides how to draw a diagram is a
 * deployment choice, not a page's: the same page renders Mermaid in one
 * environment and something richer in another.
 */

/** What a renderer is handed: the diagram in its own notation, and nothing else. */
export interface IDiagramRendererProps {
    /** The diagram text, exactly as the service produced it. */
    diagram: string;
    className?: string;
}

export type DiagramRenderer = React.ComponentType<IDiagramRendererProps>;

const renderers = new Map<string, DiagramRenderer>();

/** Register a renderer under the name a realm will use in its config. */
export function registerDiagramRenderer(name: string, renderer: DiagramRenderer): void {
    renderers.set(name, renderer);
}

/** The renderer registered under a name, if this build knows one. */
export function getDiagramRenderer(name?: string): DiagramRenderer | undefined {
    return name === undefined ? undefined : renderers.get(name);
}

/** The names on offer, so a caller can say what it did not recognise. */
export function listDiagramRenderers(): string[] {
    return [...renderers.keys()];
}
