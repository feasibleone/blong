import {describe, expect, it} from 'vitest';
import {render, screen} from '../../test/render.js';
import {Text} from './Text.js';

describe('Text', () => {
    it('renders translation key as fallback text', () => {
        const {container} = render(<Text id="buttons.save" />);
        // Falls back to the key when no translation is registered
        expect(screen.getByText('buttons.save')).toBeInTheDocument();
        expect(container).toMatchSnapshot();
    });

    it('renders inside a custom tag', () => {
        const {container} = render(
            <Text
                id="page.title"
                as="h1"
            />,
        );
        expect(container.querySelector('h1')).toBeTruthy();
        expect(container).toMatchSnapshot();
    });

    it('accepts className', () => {
        const {container} = render(
            <Text
                id="label.name"
                className="font-bold"
            />,
        );
        expect(container.querySelector('.font-bold')).toBeTruthy();
        expect(container).toMatchSnapshot();
    });
});
