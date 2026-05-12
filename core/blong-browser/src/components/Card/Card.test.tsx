import {describe, expect, it} from 'vitest';
import {fireEvent, render} from '../../test/render.js';
import {Card} from './Card.js';

describe('Card', () => {
    it('renders label and children', () => {
        const {container} = render(
            <Card
                id="test-card"
                title="My Card"
            >
                <span>inner</span>
            </Card>,
        );
        expect(container).toMatchSnapshot();
    });

    it('renders without label', () => {
        const {container} = render(<Card id="no-label-card" />);
        expect(container).toMatchSnapshot();
    });

    it('shows loading state', () => {
        const {container} = render(
            <Card
                id="loading-card"
                title="Loading"
                loading
            />,
        );
        expect(container).toMatchSnapshot();
    });

    it('renders collapsible card', () => {
        const {container} = render(
            <Card
                id="collapsible-card"
                title="Collapsible"
                collapsible
            >
                <span>content</span>
            </Card>,
        );
        expect(container).toMatchSnapshot();
    });

    it('collapses content when collapsible header is clicked', () => {
        const {container} = render(
            <Card
                id="collapsible-card"
                title="Toggle"
                collapsible
            >
                <span data-testid="inner">visible</span>
            </Card>,
        );
        // Initially visible
        expect(container.querySelector('.blong-card__body')).toBeTruthy();
        // Click to collapse
        const h3 = container.querySelector('.blong-card__label')!;
        fireEvent.click(h3);
        // Content hidden after collapse
        expect(container.querySelector('.blong-card__body')).toBeNull();
    });

    it('expands content after collapse + re-click', () => {
        const {container} = render(
            <Card
                id="card"
                title="Toggle"
                collapsible
            >
                <span>text</span>
            </Card>,
        );
        const h3 = container.querySelector('.blong-card__label')!;
        fireEvent.click(h3); // collapse
        fireEvent.click(h3); // expand
        expect(container.querySelector('.blong-card__body')).toBeTruthy();
    });
});
