import {describe, expect, it} from 'vitest';
import {render} from '../../test/render.js';
import {Json} from './index.js';

describe('Json', () => {
    it('renders raw JSON pre block', () => {
        const {container} = render(<Json value={{name: 'Alice', age: 30}} />);
        expect(container.querySelector('pre.blong-json')).toBeTruthy();
        expect(container).toMatchSnapshot();
    });

    it('renders key-value diff view', () => {
        const {container} = render(
            <Json
                value={{name: 'Alice', age: 30}}
                previous={{name: 'Bob', age: 25}}
                keyValue
            />,
        );
        expect(container.querySelector('dl.blong-json--kv')).toBeTruthy();
        expect(container).toMatchSnapshot();
    });

    it('renders null value', () => {
        const {container} = render(<Json value={null} />);
        expect(container).toMatchSnapshot();
    });

    it('shows added keys (key in current but not previous)', () => {
        const {container} = render(
            <Json
                value={{name: 'Alice', newField: 'new'}}
                previous={{name: 'Alice'}}
                keyValue
            />,
        );
        expect(container.querySelector('.blong-json__line--added')).toBeTruthy();
    });

    it('shows removed keys (key in previous but not current)', () => {
        const {container} = render(
            <Json
                value={{name: 'Alice'}}
                previous={{name: 'Alice', removed: 'gone'}}
                keyValue
            />,
        );
        expect(container.querySelector('.blong-json__line--removed')).toBeTruthy();
    });

    it('hides unchanged values when showUnchangedValues=false', () => {
        const {container} = render(
            <Json
                value={{name: 'Alice', role: 'admin'}}
                previous={{name: 'Alice', role: 'user'}}
                keyValue
                showUnchangedValues={false}
            />,
        );
        // Only changed lines should be visible
        expect(container.querySelectorAll('.blong-json__line--changed').length).toBe(1);
        expect(container.querySelectorAll('.blong-json__line--unchanged').length).toBe(0);
    });

    it('renders primitive value in key-value mode', () => {
        const {container} = render(
            <Json
                value="hello"
                keyValue
            />,
        );
        expect(container.querySelector('dl.blong-json--kv')).toBeTruthy();
        expect(container.textContent).toContain('hello');
    });

    it('renders primitive changed status', () => {
        const {container} = render(
            <Json
                value={42}
                previous={99}
                keyValue
            />,
        );
        expect(container.querySelector('.blong-json__line--changed')).toBeTruthy();
    });
});
