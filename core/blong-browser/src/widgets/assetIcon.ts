/** The media type a `data:` URI carries, e.g. `image/png`, else undefined. */
export function assetDataType(value: string | undefined): string | undefined {
    const match = /^data:([^;,]+)[;,]/.exec(value ?? '');
    return match ? match[1].toLowerCase() : undefined;
}

/**
 * The icon a stored file is shown with, from its type or its name.
 *
 * A thumbnail is only possible for a picture, so everything else needs something that says what it is at
 * a glance. The mapping is PrimeIcons' own file vocabulary; an unknown type answers a plain file rather
 * than nothing, because a row with no icon reads as a row with no value (@@D-842).
 */
export function assetIcon(contentTypeOrName: string | undefined): string {
    // A `data:` URI is its media type followed by the bytes, so the type is read before the rest of it is
    // mistaken for one.
    const value = (assetDataType(contentTypeOrName) ?? contentTypeOrName ?? '').toLowerCase();
    const extension = value.includes('/') ? '' : (value.split('.').pop() ?? '');
    const type = value.includes('/') ? value : '';

    const isImage =
        type.startsWith('image/') || /^(png|jpe?g|gif|webp|svg|avif|bmp)$/.test(extension);
    if (isImage) return 'pi pi-image';

    if (type.startsWith('video/') || /^(mp4|webm|mov|avi|mkv)$/.test(extension))
        return 'pi pi-video';
    if (type.startsWith('audio/') || /^(mp3|wav|ogg|flac|m4a)$/.test(extension))
        return 'pi pi-volume-up';

    if (type === 'application/pdf' || extension === 'pdf') return 'pi pi-file-pdf';
    if (/^(csv|xlsx?|ods)$/.test(extension) || type.includes('spreadsheet'))
        return 'pi pi-file-excel';
    if (/^(docx?|odt)$/.test(extension) || type.includes('word')) return 'pi pi-file-word';
    if (/^(zip|gz|tgz|tar|7z|rar)$/.test(extension)) return 'pi pi-box';
    if (type.startsWith('text/') || /^(txt|md|json|xml|ya?ml)$/.test(extension))
        return 'pi pi-file-edit';

    return 'pi pi-file';
}

/** Whether this value can be shown as a picture. */
export function assetIsImage(contentTypeOrName: string | undefined): boolean {
    return assetIcon(contentTypeOrName) === 'pi pi-image';
}

/**
 * What the field says the value is: a file's own name where the value carries one.
 *
 * A reference is `blob://<namespace>/<key>` and a key is generated, so it names nothing a reader
 * recognises; a URL is shortened to its last segment, and a `data:` URI is its media type — printing the
 * bytes into a form cell is what this exists to avoid (@@D-842).
 */
export function assetLabel(value: string | undefined): string {
    const raw = (value ?? '').trim();
    const dataType = assetDataType(raw);
    if (dataType) return dataType;
    if (!raw) return '';
    const withoutQuery = raw.split(/[?#]/)[0];
    const last = withoutQuery.split('/').filter(Boolean).pop();
    if (!last) return raw;
    try {
        return decodeURIComponent(last);
    } catch {
        return last;
    }
}
