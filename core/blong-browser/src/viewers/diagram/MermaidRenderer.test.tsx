import {render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import MermaidRenderer from './MermaidRenderer.js';

/**
 * Mermaid, mocked as the library it actually is: a global `initialize`, and a
 * `render(id, text)` that builds a working element of its own on `document.body`,
 * answers with the drawing *as a string*, and abandons the working element when it
 * throws.
 *
 * The real parser is not exercised here for the reason it never was: it measures
 * text with `getBBox`, which jsdom does not implement, so a real render fails for a
 * reason that has nothing to do with this component. What the mock keeps is the
 * *behaviour around* the parser, which is the part that was wrong — how often it is
 * asked, what it is initialised with, and what is left behind afterwards (F-212,
 * F-213).
 */
const mermaid = vi.hoisted(() => ({initialize: vi.fn(), render: vi.fn()}));

vi.mock('mermaid', () => ({default: mermaid}));

const DIAGRAM = ['sequenceDiagram', '    access->>db: access.db.party.subject.find'].join('\n');

/** The element mermaid creates on `document.body` before it knows any better. */
function workingElement(id: string): void {
    const wrapper = document.createElement('div');
    wrapper.id = `d${id}`;
    document.body.append(wrapper);
}

/** The drawing mermaid hands back as a string, carrying the id it drew under. */
function drawing(id: string): string {
    return `<svg id="${id}" viewBox="0 0 1 1"></svg>`;
}

/** Let React finish every render and effect it has already scheduled. */
async function settle(): Promise<void> {
    for (let tick = 0; tick < 5; tick += 1) await new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(() => {
    localStorage.removeItem('blong-browser-dark-mode');
    mermaid.initialize.mockClear();
    mermaid.render.mockReset();
    mermaid.render.mockImplementation(async (id: string) => ({
        svg: drawing(id),
        diagramType: 'sequence',
    }));
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('MermaidRenderer', () => {
    it('asks mermaid once for one diagram', async () => {
        render(<MermaidRenderer diagram={DIAGRAM} />);
        await waitFor(() => expect(document.querySelector('[data-diagram-rendered]')).toBeTruthy());

        // Every render that followed the first one — and there are several, because
        // the effect writes state and React re-renders — must not ask again. It is
        // the dependency list that decides this, and an object built per render made
        // it re-run forever, one diagram after another (F-212).
        await settle();
        expect(mermaid.render).toHaveBeenCalledTimes(1);
        expect(mermaid.render.mock.calls[0]?.[0]).toMatch(/^blong-diagram-\d+$/);
        expect(mermaid.render.mock.calls[0]?.[1]).toBe(DIAGRAM);
    });

    it('removes the working element mermaid abandons when it refuses a diagram', async () => {
        const saidOutLoud = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mermaid.render.mockImplementation(async (id: string) => {
            workingElement(id);
            throw new Error('UnknownDiagramError: No diagram type detected');
        });

        render(<MermaidRenderer diagram="this is not a diagram" />);

        // Shown, not swallowed: the reader gets the text it was given.
        const fallback = await screen.findByText('this is not a diagram');
        expect(fallback.tagName).toBe('PRE');

        const id = mermaid.render.mock.calls[0]?.[0] as string;
        await waitFor(() => expect(document.getElementById(`d${id}`)).toBeNull());
        expect(saidOutLoud).toHaveBeenCalled();
    });

    it('keeps the drawing and removes only the working element when a diagram is drawn', async () => {
        render(<MermaidRenderer diagram={DIAGRAM} />);

        const drawn = await waitFor(() => {
            const element = document.querySelector('[data-diagram-rendered]');
            expect(element).toBeTruthy();
            return element as HTMLElement;
        });

        const id = mermaid.render.mock.calls[0]?.[0] as string;
        // The sweep is aimed at the wrapper, never at the drawing: mermaid returns
        // the drawing as a string, so removing `d<id>` cannot delete it.
        expect(drawn.querySelector('svg')?.getAttribute('id')).toBe(id);
        expect(document.getElementById(`d${id}`)).toBeNull();
    });

    it('does not ask mermaid to draw nothing', async () => {
        render(<MermaidRenderer diagram="" />);

        // An empty diagram is a parse failure, not an empty render: asking would
        // spend a working element and a console error to learn what the fallback
        // already knows.
        expect(await screen.findByText('', {selector: '[data-diagram-fallback]'})).toBeTruthy();
        await settle();
        expect(mermaid.render).not.toHaveBeenCalled();
    });

    it('initialises mermaid for the theme in force, and again when the theme changes', async () => {
        const light = render(<MermaidRenderer diagram={DIAGRAM} />);
        await waitFor(() => expect(document.querySelector('[data-diagram-rendered]')).toBeTruthy());
        light.unmount();

        localStorage.setItem('blong-browser-dark-mode', 'true');
        render(<MermaidRenderer diagram={DIAGRAM} />);

        // Asserted after the change rather than before it: the leading light render
        // is what guarantees the initialisation below is a *change* of theme, so the
        // expectation does not depend on which test ran first.
        await waitFor(() =>
            expect(mermaid.initialize).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    theme: 'dark',
                    // Mermaid's own error diagram is redundant — the fallback shows
                    // the text — and it is abandoned on `document.body` when drawn.
                    suppressErrorRendering: true,
                    securityLevel: 'strict',
                    startOnLoad: false,
                }),
            ),
        );
    });
});
