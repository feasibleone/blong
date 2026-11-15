import {beforeEach, describe, expect, it, vi} from 'vitest';

import {flushEffects, render, screen, waitFor} from '../../test/render.js';
import {BlobImage} from './BlobImage.js';

/**
 * `BlobImage` renders a picture, its thumbnail, or the name it stands for.
 *
 * The three cases are the three a record can be in: a stored blob with a derived thumbnail, a stored
 * blob without one, and a person who has not chosen a photograph at all — the last of which must not be
 * an empty box (@@D-842 @@D-844).
 */
describe('BlobImage', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('renders a stored blob from the route that serves it', async () => {
        const dispatch = vi.fn(async (method: string) => {
            if (method === 'blob.blob.get') return {variants: undefined};
            throw new Error(`unexpected method ${method}`);
        });
        render(
            <BlobImage
                value="blob://party/k1"
                name="Jane Doe"
                testId="picture"
            />,
            {dispatch},
        );
        const image = await screen.findByTestId('picture');
        expect(image.tagName).toBe('IMG');
        expect(image).toHaveAttribute('src', '/a/party/k1');
        expect(image).toHaveAttribute('alt', 'Jane Doe');
    });

    it('prefers the thumbnail the record derived', async () => {
        const dispatch = vi.fn(async (method: string) => {
            if (method === 'blob.blob.get') return {variants: {thumb: {key: 'k1-thumb'}}};
            throw new Error(`unexpected method ${method}`);
        });
        render(
            <BlobImage
                value="blob://party/k1"
                testId="picture"
            />,
            {dispatch},
        );
        await waitFor(() => {
            expect(screen.getByTestId('picture')).toHaveAttribute('src', '/a/party/k1-thumb');
        });
        expect(dispatch).toHaveBeenCalledWith('blob.blob.get', {namespace: 'party', key: 'k1'}, {});
    });

    it('serves the blob itself when it is asked for no thumbnail', async () => {
        const dispatch = vi.fn(async (method: string) => {
            if (method === 'blob.blob.get') return {variants: {thumb: {key: 'k1-thumb'}}};
            throw new Error(`unexpected method ${method}`);
        });
        render(
            <BlobImage
                value="blob://party/k1"
                thumbnail={false}
                testId="picture"
            />,
            {
                dispatch,
            },
        );
        const image = await screen.findByTestId('picture');
        expect(image).toHaveAttribute('src', '/a/party/k1');
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('leaves a pasted URL alone and asks for no record', async () => {
        const dispatch = vi.fn();
        render(
            <BlobImage
                value="https://example.com/a.png"
                testId="picture"
            />,
            {dispatch},
        );
        const image = await screen.findByTestId('picture');
        expect(image).toHaveAttribute('src', 'https://example.com/a.png');
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('shows the initials when there is nothing to show', async () => {
        const dispatch = vi.fn();
        render(
            <BlobImage
                value={null}
                name="Jane Doe"
                testId="picture"
            />,
            {dispatch},
        );
        const box = await screen.findByTestId('picture');
        expect(box.tagName).toBe('SPAN');
        expect(box).toHaveTextContent('JD');
    });

    it('shows a generic person when not even a name is known', async () => {
        render(<BlobImage testId="picture" />);
        await flushEffects();
        const box = screen.getByTestId('picture');
        expect(box.querySelector('.pi-user')).toBeTruthy();
    });

    it('falls back to the initials when the picture does not load', async () => {
        render(
            <BlobImage
                value="blob://party/k1"
                name="Jane Doe"
                testId="picture"
            />,
            {
                dispatch: vi.fn(async () => ({variants: undefined})),
            },
        );
        const image = await screen.findByTestId('picture');
        image.dispatchEvent(new Event('error'));
        await waitFor(() => {
            expect(screen.getByTestId('picture').tagName).toBe('SPAN');
        });
        expect(screen.getByTestId('picture')).toHaveTextContent('JD');
    });

    it('keeps the box the caller asked for', async () => {
        render(
            <BlobImage
                value={null}
                name="Jane Doe"
                size={48}
                shape="square"
                testId="picture"
            />,
        );
        const box = await screen.findByTestId('picture');
        expect(box).toHaveClass('blong-blob-image--square');
        expect(box).toHaveStyle({width: '48px', height: '48px'});
    });
});
