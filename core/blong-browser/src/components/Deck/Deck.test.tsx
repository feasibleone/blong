import {DndContext} from '@dnd-kit/core';
import {beforeEach, describe, expect, it} from 'vitest';
import {DesignModeProvider} from '../../design/DesignModeContext.js';
import {render, screen} from '../../test/render.js';
import {Deck} from './index.js';

// Deck uses useDesignMode — keep design mode off by default
beforeEach(() => {
    // Ensure design mode context is inactive (default DesignModeProvider state)
});

describe('Deck', () => {
    it('renders children', () => {
        render(
            <Deck id="test-deck">
                <div data-testid="child">Content</div>
            </Deck>,
        );
        expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('applies blong-deck class', () => {
        const {container} = render(
            <Deck id="deck-1">
                <span />
            </Deck>,
        );
        expect(container.querySelector('.blong-deck')).toBeInTheDocument();
    });

    it('applies custom className', () => {
        const {container} = render(
            <Deck
                id="deck-2"
                className="my-deck"
            >
                <span />
            </Deck>,
        );
        expect(container.querySelector('.blong-deck.my-deck')).toBeInTheDocument();
    });

    it('does not render DropZones when design mode is inactive', () => {
        const {container} = render(
            <Deck id="deck-3">
                <span />
            </Deck>,
        );
        expect(container.querySelector('.blong-drop-zone')).toBeNull();
    });

    it('renders DropZones when design mode is active', () => {
        const {container} = render(
            <DesignModeProvider
                active
                initialConfig={{cards: {}, layouts: {}}}
            >
                <DndContext>
                    <Deck id="deck-active">
                        <span>child</span>
                    </Deck>
                </DndContext>
            </DesignModeProvider>,
        );
        // In active design mode, before/after DropZones should render
        expect(container.querySelectorAll('[class*="drop"]').length).toBeGreaterThan(0);
    });
});
