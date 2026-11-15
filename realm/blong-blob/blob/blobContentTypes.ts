/**
 * The content types the store accepts, one row per extension.
 *
 * The table is `ut-document`'s, extended with the two media types this realm is asked to carry, and
 * it is the whole allow-list: an extension absent here is refused rather than guessed. A row lists
 * every type the extension may legitimately be declared as, because a `.xml` arrives as either
 * `application/xml` or `text/xml` and a browser will not be argued with.
 */
export const BLOB_CONTENT_TYPES: Record<string, string[]> = {
    bin: ['application/octet-stream'],
    csv: ['text/csv'],
    doc: ['application/msword'],
    docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    html: ['text/html'],
    jpeg: ['image/jpeg'],
    jpg: ['image/jpeg'],
    pdf: ['application/pdf'],
    png: ['image/png'],
    txt: ['text/plain'],
    xls: ['application/vnd.ms-excel'],
    xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    xml: ['application/xml', 'text/xml'],
    json: ['application/json'],
    yaml: ['text/yaml', 'application/yaml'],
    mp3: ['audio/mpeg'],
    mp4: ['video/mp4'],
};

/** Every extension the store accepts. */
export const BLOB_EXTENSIONS = Object.keys(BLOB_CONTENT_TYPES);

/** A filename's extension, lowercased, or the empty string when it has none. */
export function blobExtensionOf(filename: string | undefined): string {
    const match = /\.([A-Za-z0-9]+)$/.exec(filename ?? '');
    return match ? match[1]!.toLowerCase() : '';
}

/** An extension the table holds. */
export function blobExtensionAllowed(extension: string): boolean {
    return Object.prototype.hasOwnProperty.call(BLOB_CONTENT_TYPES, extension);
}

/**
 * Whether `contentType` may be declared for `extension` — parameters such as `; charset=utf-8` are
 * compared away, because they are the sender's business and not the file's.
 */
export function blobContentTypeMatches(extension: string, contentType: string): boolean {
    const bare = contentType.split(';')[0]!.trim().toLowerCase();
    return (BLOB_CONTENT_TYPES[extension] ?? []).includes(bare);
}

/** The first content type an extension may carry, used when a caller names none. */
export function blobContentTypeOf(extension: string): string {
    return BLOB_CONTENT_TYPES[extension]?.[0] ?? 'application/octet-stream';
}
