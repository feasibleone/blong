import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Theme} from '../../components/Theme/Theme.js';
import {render, screen, waitFor} from '../../test/render.js';
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
const mermaid = vi.hoisted(() => ({
    initialize: vi.fn(),
    render: vi.fn(),
    /**
     * The theme mermaid is holding, as `initialize` last set it. Deliberately *not*
     * reset between tests: it is global configuration, it outlives a component, and
     * a mock that forgot it would let a renderer that stopped re-initialising pass.
     */
    theme: undefined as string | undefined,
}));

vi.mock('mermaid', () => ({default: mermaid}));

const DIAGRAM = ['sequenceDiagram', '    access->>db: access.db.party.subject.find'].join('\n');

/** The element mermaid creates on `document.body` before it knows any better. */
function workingElement(id: string): void {
    const wrapper = document.createElement('div');
    wrapper.id = `d${id}`;
    document.body.append(wrapper);
}

/** The drawing mermaid hands back, carrying the id — and the theme — it drew under. */
function drawing(id: string): string {
    return `<svg id="${id}" data-theme="${mermaid.theme}" viewBox="0 0 1 1"></svg>`;
}

/** Let React finish every render and effect it has already scheduled. */
async function settle(): Promise<void> {
    for (let tick = 0; tick < 5; tick += 1) await new Promise(resolve => setTimeout(resolve, 0));
}

/** The theme the diagram on screen was drawn with. */
async function drawnTheme(): Promise<string | undefined> {
    const drawn = await waitFor(() => {
        const element = document.querySelector('[data-diagram-rendered] svg');
        expect(element).toBeTruthy();
        return element as SVGElement;
    });
    return drawn.getAttribute('data-theme') ?? undefined;
}

beforeEach(() => {
    mermaid.initialize.mockClear();
    mermaid.render.mockReset();
    mermaid.render.mockImplementation(async (id: string) => ({
        svg: drawing(id),
        diagramType: 'sequence',
    }));
    mermaid.initialize.mockImplementation(({theme}: {theme?: string}) => {
        mermaid.theme = theme;
    });
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

    it('draws in the palette the page is in', async () => {
        render(
            <Theme theme={{type: 'compact', palette: 'light'}}>
                <MermaidRenderer diagram={DIAGRAM} />
            </Theme>,
        );
        expect(await drawnTheme()).toBe('neutral');
    });

    it('draws dark where no theme is in force, which is the platform default', async () => {
        // A viewer used outside `<Theme>` still has to draw something, and the
        // platform's own default is dark — the app config, the portal's
        // `DEFAULT_THEME` and the shared story decorator all say so.
        render(<MermaidRenderer diagram={DIAGRAM} />);
        expect(await drawnTheme()).toBe('dark');
    });

    it('redraws when the palette changes under it, and leaves nothing behind', async () => {
        const light = render(
            <Theme theme={{type: 'compact', palette: 'light'}}>
                <MermaidRenderer diagram={DIAGRAM} />
            </Theme>,
        );
        expect(await drawnTheme()).toBe('neutral');
        light.unmount();

        render(
            <Theme theme={{type: 'compact', palette: 'dark'}}>
                <MermaidRenderer diagram={DIAGRAM} />
            </Theme>,
        );

        // Initialised with the theme that is now in force, not the one the first
        // diagram happened to see (D-235) — and with the two settings that keep a
        // refused diagram from littering the document: `strict` sanitises what is
        // injected, `suppressErrorRendering` stops mermaid drawing its own error
        // diagram into an element it then abandons (F-213).
        expect(await drawnTheme()).toBe('dark');
        expect(mermaid.initialize).toHaveBeenLastCalledWith(
            expect.objectContaining({
                theme: 'dark',
                suppressErrorRendering: true,
                securityLevel: 'strict',
                startOnLoad: false,
            }),
        );
        expect(document.querySelectorAll('[id^="dblong-diagram-"]').length).toBe(0);
    });
});
