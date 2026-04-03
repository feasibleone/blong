import {act} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {useAppStore} from '../../state/appStore.js';
import {render, screen} from '../../test/render.js';
import {ErrorDialog} from './index.js';

describe('ErrorDialog', () => {
    it('renders nothing when there is no error', () => {
        useAppStore.setState(s => ({...s, error: null}));
        const {container} = render(<ErrorDialog />);
        // No dialog rendered
        expect(container.querySelector('.blong-error-dialog')).toBeNull();
    });

    it('renders error message when error is set', () => {
        act(() => {
            useAppStore.setState(s => ({
                ...s,
                error: {
                    type: 'some.error',
                    message: 'Something went wrong',
                    print: 'Something went wrong',
                },
            }));
        });
        render(<ErrorDialog />);
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('shows validation errors as a list', () => {
        act(() => {
            useAppStore.setState(s => ({
                ...s,
                error: {
                    type: 'validation.error',
                    message: 'Validation failed',
                    validation: [
                        {field: 'email', message: 'Invalid email'},
                        {field: 'name', message: 'Required'},
                    ],
                },
            }));
        });
        render(<ErrorDialog />);
        expect(screen.getByText(/Invalid email/)).toBeInTheDocument();
        expect(screen.getByText(/Required/)).toBeInTheDocument();
    });
});
