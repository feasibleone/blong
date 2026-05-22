/** Escape a string value for safe embedding in XML/XHTML. */
export declare function escapeXml(value: unknown): string;
/** Escape a string value for safe embedding in HTML. */
export declare function escapeHtml(value: unknown): string;
/**
 * Serialize a value for embedding inside a JSON string context.
 * For strings: returns the content without surrounding quotes (so it can be
 * embedded directly inside `"..."` in a larger JSON document).
 * For non-strings: returns the full JSON representation.
 */
export declare function escapeJson(value: unknown): string;
/**
 * Prepare a raw template string for wrapping in backticks so it can be
 * evaluated as a JavaScript template literal.
 *
 * Rules:
 *  - In **literal** (non-expression) parts: escape `\` → `\\` and `` ` `` →
 *    `` \` `` so they are not misinterpreted by the JS parser.
 *  - Inside `${…}` expression blocks (including nested template literals and
 *    string literals within them): pass characters through unchanged. Backticks
 *    there start nested template literals and must not be escaped.
 *
 * This allows templates like `${blong.xml\`<tag>${v}</tag>\`}` to work
 * correctly.
 */
export declare function escapeForTemplateLiteral(str: string): string;
type TagFn = (strings: TemplateStringsArray, ...values: unknown[]) => string;
/** Tagged template literal that XML-escapes all interpolated values. */
export declare const xmlTag: TagFn;
/** Tagged template literal that HTML-escapes all interpolated values. */
export declare const htmlTag: TagFn;
/** Tagged template literal that JSON-serializes all interpolated values. */
export declare const jsonTag: TagFn;
export {};
