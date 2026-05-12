import {act} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {useAppStore} from '../../state/appStore.js';
import {render} from '../../test/render.js';
import {Loader} from './Loader.js';

describe('Loader', () => {
    it('renders nothing when not loading', () => {
        const {container} = render(<Loader />);
        expect(container.firstChild).toBeNull();
        expect(container).toMatchSnapshot();
    });

    it('renders overlay when loading is active', () => {
        const {container} = render(<Loader />);
        act(() => {
            useAppStore.getState().setLoading(true, 'Please wait…');
        });
        expect(container.querySelector('[role="status"]')).toBeTruthy();
        expect(container).toMatchSnapshot();
        // cleanup
        act(() => {
            useAppStore.getState().setLoading(false);
        });
    });
});
