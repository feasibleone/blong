import {describe, expect, it} from 'vitest';

import {assetDataType, assetIcon, assetIsImage, assetLabel} from './assetIcon.js';

describe('assetIcon', () => {
    it('reads a media type', () => {
        expect(assetIcon('image/png')).toBe('pi pi-image');
        expect(assetIcon('application/pdf')).toBe('pi pi-file-pdf');
        expect(assetIcon('text/csv')).toBe('pi pi-file-edit');
    });

    it('reads an extension', () => {
        expect(assetIcon('report-notes.pdf')).toBe('pi pi-file-pdf');
        expect(assetIcon('photo.JPG')).toBe('pi pi-image');
        expect(assetIcon('archive.tar.gz')).toBe('pi pi-box');
    });

    it('answers a plain file for a key it cannot place', () => {
        // A blob key is generated, so nothing in it names a type: the record is what says what the file
        // is, and this is the fallback behind it (@@D-842).
        expect(assetIcon('k1')).toBe('pi pi-file');
        expect(assetIcon(undefined)).toBe('pi pi-file');
    });

    it('reads the type a data URI carries, not the bytes', () => {
        expect(assetIcon('data:image/png;base64,iVBORw0KGgo=')).toBe('pi pi-image');
        expect(assetIcon('data:application/pdf;base64,JVBERi0=')).toBe('pi pi-file-pdf');
        expect(assetIsImage('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
        expect(assetDataType('data:image/png;base64,iVBOR')).toBe('image/png');
        expect(assetDataType('blob://party/k1')).toBe(undefined);
    });
});

describe('assetLabel', () => {
    it('names a data URI by its type', () => {
        // Printing the bytes into a form cell is what the label exists to avoid.
        expect(assetLabel('data:image/png;base64,iVBORw0KGgo=')).toBe('image/png');
    });

    it('shortens a reference and a URL to the last segment', () => {
        expect(assetLabel('blob://party/report-notes')).toBe('report-notes');
        expect(assetLabel('https://example.test/files/report.pdf?token=abc#page=2')).toBe(
            'report.pdf',
        );
    });

    it('leaves a bare key alone, and answers nothing for an empty value', () => {
        expect(assetLabel('k1')).toBe('k1');
        expect(assetLabel('')).toBe('');
        expect(assetLabel(undefined)).toBe('');
    });
});
