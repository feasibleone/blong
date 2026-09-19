import MermaidRenderer from './MermaidRenderer.js';
import {
    getDiagramRenderer,
    registerDiagramRenderer,
    type IDiagramRendererProps,
} from './rendererRegistry.js';

/** The notation the semantic-log service emits, and the default until told otherwise. */
export const DEFAULT_DIAGRAM_RENDERER = 'mermaid';

// Registered where the viewer is defined, not where a page is written: a page
// that shows a diagram should not also have to know that drawing one needs a
// registration, and the registration is idempotent.
registerDiagramRenderer(DEFAULT_DIAGRAM_RENDERER, MermaidRenderer);

export interface IDiagramViewerProps extends IDiagramRendererProps {
    /**
     * Which notation `diagram` is in — a name the registry knows. A realm sets
     * this from its own config, so the choice is a deployment's.
     */
    renderer?: string;
}

/**
 * Draw a diagram through the registered renderer for its notation.
 *
 * An unknown notation is shown as it came rather than as nothing: the text *is*
 * the diagram, and a renderer for it may exist in another build.
 */
export default function DiagramViewer({
    diagram,
    renderer = DEFAULT_DIAGRAM_RENDERER,
    className,
}: IDiagramViewerProps) {
    const Renderer = getDiagramRenderer(renderer);
    if (Renderer === undefined) {
        return (
            <pre className={className} data-diagram-renderer={renderer}>
                {diagram}
            </pre>
        );
    }
    return (
        <div className={className} data-diagram-renderer={renderer}>
            <Renderer diagram={diagram} />
        </div>
    );
}
