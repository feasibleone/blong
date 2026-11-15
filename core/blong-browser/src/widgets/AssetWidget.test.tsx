import {act} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import type {IEnrichedFieldSchema} from '@feasibleone/blong';

import {fireEvent, flushEffects, render, screen, waitFor} from '../test/render.js';
import {AssetWidget} from './AssetWidget.js';
import {assetIcon, assetIsImage} from './assetIcon.js';

/** The field schema a consuming realm writes: one `x-widget` block and nothing else. */
const schema = {
    title: 'Photograph',
    type: 'string',
    widget: {namespace: 'party', scopes: ['party:person:1'], accept: 'image/*'},
} as unknown as IEnrichedFieldSchema;

/** A file the picker could answer. */
function picture(name = 'portrait.png', type = 'image/png'): File {
    return new File([new Uint8Array([1, 2, 3, 4])], name, {type});
}

/** A dispatch that answers the three upload calls and remembers what it was asked. */
function uploadDispatch(options: {prepareFails?: boolean} = {}) {
    const dispatch = vi.fn(async (method: string, params?: Record<string, unknown>) => {
        switch (method) {
            case 'blob.upload.prepare':
                if (options.prepareFails) throw new Error('blob.uploadExpired');
                return {
                    key: 'k1',
                    namespace: String(params?.['namespace'] ?? 'party'),
                    uri: 'blob://party/k1',
                    uploadUrl: '/a/party/u/k1',
                    expiresAt: new Date().toISOString(),
                };
            case 'blob.upload.commit':
                return {key: 'k1', namespace: 'party', uri: 'blob://party/k1'};
            case 'blob.upload.discard':
                return {discarded: true};
            case 'blob.blob.get':
                return {contentType: 'image/png', variants: undefined};
            default:
                throw new Error(`unexpected method ${method}`);
        }
    });
    return dispatch;
}

/** The methods a stub was asked for, in order. */
const methods = (dispatch: {mock: {calls: unknown[][]}}) =>
    dispatch.mock.calls.map(call => call[0] as string);

describe('assetIcon', () => {
    it('names a picture, a document and an archive by their type or their name', () => {
        expect(assetIcon('image/png')).toBe('pi pi-image');
        expect(assetIcon('photo.JPG')).toBe('pi pi-image');
        expect(assetIcon('film.mp4')).toBe('pi pi-video');
        expect(assetIcon('audio/mpeg')).toBe('pi pi-volume-up');
        expect(assetIcon('report.pdf')).toBe('pi pi-file-pdf');
        expect(assetIcon('sheet.xlsx')).toBe('pi pi-file-excel');
        expect(assetIcon('letter.docx')).toBe('pi pi-file-word');
        expect(assetIcon('bundle.zip')).toBe('pi pi-box');
        expect(assetIcon('notes.txt')).toBe('pi pi-file-edit');
        // An unknown type still reads as a file rather than as nothing.
        expect(assetIcon('mystery.bin')).toBe('pi pi-file');
        expect(assetIcon(undefined)).toBe('pi pi-file');
    });

    it('says whether a value can be shown as a picture', () => {
        expect(assetIsImage('image/png')).toBe(true);
        expect(assetIsImage('report.pdf')).toBe(false);
    });
});

describe('AssetWidget', () => {
    beforeEach(() => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(null, {status: 200})),
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('prepares, PUTs and commits the file it was given', async () => {
        const dispatch = uploadDispatch();
        const onChange = vi.fn();
        render(
            <AssetWidget
                name="photograph"
                schema={schema}
                value={null}
                onChange={onChange}
                onBlur={vi.fn()}
            />,
            {dispatch},
        );
        await flushEffects();

        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        expect(input).toBeTruthy();
        fireEvent.change(input, {target: {files: [picture()]}});

        await waitFor(() => expect(onChange).toHaveBeenCalledWith('blob://party/k1'));
        expect(methods(dispatch)).toEqual([
            'blob.upload.prepare',
            'blob.upload.commit',
        ]);
        expect(dispatch.mock.calls[0]![1]).toMatchObject({
            namespace: 'party',
            contentType: 'image/png',
            filename: 'portrait.png',
            scopes: ['party:person:1'],
        });
        // The bytes went to the route the server answered, not into the JSON call.
        const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]! as [
            string,
            {method: string; body: File},
        ];
        expect(url).toBe('/a/party/u/k1');
        expect(init.method).toBe('PUT');
        expect(init.body).toBeInstanceOf(File);
    });

    it('fills the sibling fields the model named, from the record it stored', async () => {
        // A document's format and checksum are copies of what the store measured, so the field
        // publishes them rather than asking a reader for them twice (@@D-842).
        const dispatch = vi.fn(async (method: string) => {
            if (method === 'blob.upload.prepare') {
                return {
                    key: 'k1',
                    namespace: 'sport',
                    uri: 'blob://sport/k1',
                    uploadUrl: '/a/sport/u/k1',
                };
            }
            if (method === 'blob.upload.commit') {
                return {key: 'k1', namespace: 'sport', uri: 'blob://sport/k1'};
            }
            if (method === 'blob.blob.get') {
                return {
                    contentType: 'application/pdf',
                    size: 4096,
                    digest: 'a1b2c3',
                    originalFilename: 'contract.pdf',
                };
            }
            return {};
        });
        const onFill = vi.fn();
        render(
            <AssetWidget
                name="referenceUrl"
                schema={
                    {
                        widget: {
                            type: 'asset',
                            namespace: 'sport',
                            accept: '.pdf',
                            fill: {
                                'document.documentFormat': 'extension',
                                'document.checksumValue': 'digest',
                            },
                        },
                    } as unknown as IEnrichedFieldSchema
                }
                value={null}
                onChange={vi.fn()}
                onBlur={vi.fn()}
                onFill={onFill}
            />,
            {dispatch},
        );
        await flushEffects();
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(input, {
            target: {files: [new File([new Uint8Array([1])], 'contract.pdf', {type: 'application/pdf'})]},
        });

        await waitFor(() => expect(onFill).toHaveBeenCalledTimes(2));
        expect(onFill).toHaveBeenCalledWith('document.documentFormat', 'pdf');
        expect(onFill).toHaveBeenCalledWith('document.checksumValue', 'a1b2c3');
    });

    it('discards what it reserved when the form goes away without a value', async () => {
        // The commit never answers, so the widget holds a reserved key when it unmounts.
        const dispatch = vi.fn(async (method: string) => {
            if (method === 'blob.upload.prepare') {
                return {
                    key: 'k1',
                    namespace: 'party',
                    uri: 'blob://party/k1',
                    uploadUrl: '/a/party/u/k1',
                };
            }
            if (method === 'blob.upload.discard') return {discarded: true};
            return new Promise(() => undefined);
        });
        const view = render(
            <AssetWidget
                name="photograph"
                schema={schema}
                value={null}
                onChange={vi.fn()}
                onBlur={vi.fn()}
            />,
            {dispatch},
        );
        await flushEffects();
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(input, {target: {files: [picture()]}});
        await waitFor(() => expect(methods(dispatch)).toContain('blob.upload.prepare'));

        view.unmount();
        await waitFor(() =>
            expect(dispatch).toHaveBeenCalledWith(
                'blob.upload.discard',
                {namespace: 'party', key: 'k1'},
                {},
            ),
        );
    });

    it('keeps what it committed — an unmount after a value is not a discard', async () => {
        const dispatch = uploadDispatch();
        const view = render(
            <AssetWidget
                name="photograph"
                schema={schema}
                value={null}
                onChange={vi.fn()}
                onBlur={vi.fn()}
            />,
            {dispatch},
        );
        await flushEffects();
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(input, {target: {files: [picture()]}});
        await waitFor(() => expect(methods(dispatch)).toContain('blob.upload.commit'));
        view.unmount();
        await flushEffects();
        expect(methods(dispatch)).not.toContain('blob.upload.discard');
    });

    it('discards its own key when the upload fails, and says so', async () => {
        (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(
            async () => new Response(null, {status: 413}),
        );
        const dispatch = uploadDispatch();
        render(
            <AssetWidget
                name="photograph"
                schema={schema}
                value={null}
                onChange={vi.fn()}
                onBlur={vi.fn()}
            />,
            {dispatch},
        );
        await flushEffects();
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(input, {target: {files: [picture()]}});

        await waitFor(() => expect(screen.getByText(/413/)).toBeInTheDocument());
        expect(methods(dispatch)).toContain('blob.upload.discard');
        expect(methods(dispatch)).not.toContain('blob.upload.commit');
    });

    it('shows a picture for an image and an icon for anything else', async () => {
        const dispatch = uploadDispatch();
        const pictureView = render(
            <AssetWidget
                name="photograph"
                schema={schema}
                value="blob://party/k1"
                onChange={vi.fn()}
                onBlur={vi.fn()}
                id="asset"
            />,
            {dispatch},
        );
        await flushEffects();
        expect(screen.getByTestId('asset').querySelector('img')).toBeTruthy();
        pictureView.unmount();

        // A document's record says what it is; a generated key carries no extension to guess from.
        const documentDispatch = vi.fn(async (method: string) =>
            method === 'blob.blob.get' ? {contentType: 'application/pdf'} : undefined,
        );
        render(
            <AssetWidget
                name="report"
                schema={schema}
                value="blob://party/x9"
                onChange={vi.fn()}
                onBlur={vi.fn()}
                id="asset"
            />,
            {dispatch: documentDispatch},
        );
        await waitFor(() => {
            expect(screen.getByTestId('asset').querySelector('.pi-file-pdf')).toBeTruthy();
        });
        expect(screen.getByTestId('asset').querySelector('img')).toBeFalsy();
    });

    it('removes the value it holds', async () => {
        const dispatch = uploadDispatch();
        const onChange = vi.fn();
        render(
            <AssetWidget
                name="report"
                schema={schema}
                value="blob://party/k1"
                onChange={onChange}
                onBlur={vi.fn()}
                id="asset"
            />,
            {dispatch},
        );
        await flushEffects();
        act(() => {
            (screen.getByLabelText('Remove') as HTMLButtonElement).click();
        });
        expect(onChange).toHaveBeenCalledWith(null);
    });

    it('takes a pasted link instead of a file', async () => {
        const dispatch = uploadDispatch();
        const onChange = vi.fn();
        render(
            <AssetWidget
                name="photograph"
                schema={schema}
                value={null}
                onChange={onChange}
                onBlur={vi.fn()}
            />,
            {dispatch},
        );
        await flushEffects();
        const input = screen.getByPlaceholderText('https://…');
        fireEvent.change(input, {target: {value: 'https://example.com/a.png'}});
        fireEvent.blur(input);
        expect(onChange).toHaveBeenCalledWith('https://example.com/a.png');
        expect(dispatch).not.toHaveBeenCalled();
    });
});
