import {escapeHtml, escapeJson, escapeXml, htmlTag, jsonTag, xmlTag} from './escape.ts';

/** The `blong` helper namespace available inside all template expressions. */
export interface BlongHelpers {
    /** Escape a value for safe embedding in XML/XHTML attributes and text. */
    escapeXml(value: unknown): string;
    /** Escape a value for safe embedding in HTML attributes and text. */
    escapeHtml(value: unknown): string;
    /**
     * Serialize a value for embedding inside a JSON string context.
     * For strings, returns the escaped content without surrounding quotes.
     * For other values, returns the full JSON representation.
     */
    escapeJson(value: unknown): string;
    /** Join an array into a string with an optional separator. */
    join(arr: unknown[], separator?: string): string;
    /**
     * Tagged template that XML-escapes all interpolated values.
     * @example blong.xml`<tag>${value}</tag>` → "<tag>safe&amp;value</tag>"
     */
    xml(strings: TemplateStringsArray, ...values: unknown[]): string;
    /**
     * Tagged template that HTML-escapes all interpolated values.
     * @example blong.html`<p>${value}</p>`
     */
    html(strings: TemplateStringsArray, ...values: unknown[]): string;
    /**
     * Tagged template that JSON-serializes all interpolated values.
     * @example blong.json`{"name":${name}}`
     */
    json(strings: TemplateStringsArray, ...values: unknown[]): string;
}

/** The frozen `blong` helper object injected into every template expression scope. */
export const helpers: BlongHelpers = Object.freeze({
    escapeXml,
    escapeHtml,
    escapeJson,
    join(arr: unknown[], separator = ''): string {
        return ([] as unknown[]).concat(arr).join(separator);
    },
    xml: xmlTag,
    html: htmlTag,
    json: jsonTag,
});
