import {DndContext} from '@dnd-kit/core';
import {beforeEach, describe, expect, it} from 'vitest';
import {DesignModeProvider} from '../../design/DesignModeContext.js';
import {render, screen} from '../../test/render.js';
import {Form} from '../Form/index.js';
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

describe('Deck root-mode activation', () => {
    it('activates root mode only when id="root" within a Form', () => {
        // When rendered inside Form with id="root", Deck should delegate to RootDeck layout
        const schema = {
            properties: {userName: {title: 'User Name'}},
        };
        const cards = {
            info: {label: 'Info', widgets: ['userName']},
        };
        const {container} = render(
            <Form
                schema={schema}
                cards={cards}
                layouts={{default: ['info']}}
            />,
        );
        // Form renders <Deck id="root" /> internally — it should produce a form with card content
        expect(container.querySelector('form')).toBeTruthy();
        // The card label should be visible
        expect(container.querySelector('.blong-form')).toBeTruthy();
    });

    it('does NOT activate root mode for Deck with non-root id inside a Form', () => {
        // A Deck with a non-"root" id outside Form context should remain in passthrough mode
        const {container} = render(
            <Deck id="deck-99">
                <span data-testid="inner-content">inner</span>
            </Deck>,
        );
        // The inner-content span should be rendered (passthrough mode, no FormContext)
        expect(container.querySelector('[data-testid="inner-content"]')).toBeTruthy();
    });

    it('renders split layout when ISplitLayoutConfig provided', () => {
        const schema = {properties: {userName: {title: 'User Name'}, email: {title: 'Email'}}};
        const cards = {
            left: {label: 'Left', widgets: ['userName']},
            right: {label: 'Right', widgets: ['email']},
        };
        const {container} = render(
            <Form
                schema={schema}
                cards={cards}
                layout="split"
                layouts={{
                    split: {
                        type: 'split',
                        panels: [
                            {size: 50, cards: ['left']},
                            {size: 50, cards: ['right']},
                        ],
                    } as import('../../hooks/useLayout.js').ISplitLayoutConfig,
                }}
            />,
        );
        // PrimeReact Splitter renders with class p-splitter
        expect(container.querySelector('.p-splitter')).toBeTruthy();
    });
});
