import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import DiagramViewer, {DEFAULT_DIAGRAM_RENDERER} from './DiagramViewer.js';
import {getDiagramRenderer, listDiagramRenderers, registerDiagramRenderer} from './rendererRegistry.js';

/**
 * The registry and the viewer's two refusals.
 *
 * Mermaid's own output is not asserted here: drawing it needs a browser, the
 * story covers what it looks like, and a test that stubbed the parser would
 * assert the stub. What is asserted is the part that is this code's — that a
 * name resolves, that an unknown name degrades to the text, and that an empty
 * diagram is not drawn as an error.
 */
describe('diagram renderer registry', () => {
    it('resolves a registered name and refuses an unknown one', () => {
        const Stub = (): null => null;
        registerDiagramRenderer('stub-notation', Stub);
        expect(getDiagramRenderer('stub-notation')).toBe(Stub);
        expect(getDiagramRenderer('nothing-registered-here')).toBeUndefined();
        expect(getDiagramRenderer(undefined)).toBeUndefined();
    });

    it('ships mermaid as the default notation', () => {
        expect(listDiagramRenderers()).toContain(DEFAULT_DIAGRAM_RENDERER);
    });
});

describe('DiagramViewer', () => {
    it('shows the diagram text when no renderer is registered for its notation', () => {
        render(<DiagramViewer diagram="graph TD; a-->b" renderer="not-a-notation" />);
        const shown = screen.getByText('graph TD; a-->b');
        expect(shown.tagName).toBe('PRE');
        expect(shown.closest('[data-diagram-renderer]')?.getAttribute('data-diagram-renderer')).toBe(
            'not-a-notation',
        );
    });

    it('shows an empty diagram as nothing rather than failing to draw it', async () => {
        render(<DiagramViewer diagram="" />);
        const shown = await screen.findByText('', {selector: '[data-diagram-fallback]'});
        expect(shown).toBeTruthy();
    });
});
