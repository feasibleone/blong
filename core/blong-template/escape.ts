const XML_RE = /[&"'<>]/g;
const HTML_RE = /[&"'<>]/g;

const xmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
    '<': '&lt;',
    '>': '&gt;',
};

const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '"': '&quot;',
    "'": '&#39;',
    '<': '&lt;',
    '>': '&gt;',
};

/** Escape a string value for safe embedding in XML/XHTML. */
export function escapeXml(value: unknown): string {
    return String(value ?? '').replace(XML_RE, ch => xmlEscapes[ch]!);
}

/** Escape a string value for safe embedding in HTML. */
export function escapeHtml(value: unknown): string {
    return String(value ?? '').replace(HTML_RE, ch => htmlEscapes[ch]!);
}

/**
 * Serialize a value for embedding inside a JSON string context.
 * For strings: returns the content without surrounding quotes (so it can be
 * embedded directly inside `"..."` in a larger JSON document).
 * For non-strings: returns the full JSON representation.
 */
export function escapeJson(value: unknown): string {
    const serialized = JSON.stringify(value ?? null);
    return typeof value === 'string' ? serialized.slice(1, -1) : serialized;
}

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
export function escapeForTemplateLiteral(str: string): string {
    let result = '';
    let i = 0;
    const len = str.length;

    function scanTemplate(): void {
        while (i < len) {
            const ch = str[i];
            if (ch === '\\') {
                result += '\\\\';
                i++;
            } else if (ch === '`') {
                // Literal backtick in the template text — escape it
                result += '\\`';
                i++;
            } else if (ch === '$' && str[i + 1] === '{') {
                result += '${';
                i += 2;
                scanExpression(1);
            } else {
                result += ch;
                i++;
            }
        }
    }

    function scanExpression(depth: number): void {
        while (i < len && depth > 0) {
            const ch = str[i];
            if (ch === '{') {
                depth++;
                result += ch;
                i++;
            } else if (ch === '}') {
                depth--;
                result += ch;
                i++;
            } else if (ch === '`') {
                // Nested template literal inside expression — copy verbatim
                result += ch;
                i++;
                scanNestedTemplate();
            } else if (ch === '"' || ch === "'") {
                scanStringLiteral(ch);
            } else if (ch === '/' && str[i + 1] === '/') {
                // Line comment — copy to end of line
                while (i < len && str[i] !== '\n') {
                    result += str[i++];
                }
            } else {
                result += ch;
                i++;
            }
        }
    }

    function scanNestedTemplate(): void {
        // Inside a backtick template literal that is itself inside an expression.
        // Copy verbatim, but recurse into any ${…} blocks.
        while (i < len) {
            const ch = str[i];
            if (ch === '`') {
                result += ch;
                i++;
                return; // End of nested template
            } else if (ch === '\\') {
                result += str[i] + (str[i + 1] ?? '');
                i += 2;
            } else if (ch === '$' && str[i + 1] === '{') {
                result += '${';
                i += 2;
                scanExpression(1);
            } else {
                result += ch;
                i++;
            }
        }
    }

    function scanStringLiteral(quote: string): void {
        result += quote;
        i++;
        while (i < len && str[i] !== quote) {
            if (str[i] === '\\') {
                result += str[i] + (str[i + 1] ?? '');
                i += 2;
            } else {
                result += str[i++];
            }
        }
        if (i < len) {
            result += str[i++]; // closing quote
        }
    }

    scanTemplate();
    return result;
}

type TagFn = (strings: TemplateStringsArray, ...values: unknown[]) => string;

function makeTag(escapeFn: (v: unknown) => string): TagFn {
    return (strings, ...values) => {
        let result = '';
        for (let i = 0; i < strings.length; i++) {
            if (i > 0) result += escapeFn(values[i - 1]);
            result += strings[i];
        }
        return result;
    };
}

/** Tagged template literal that XML-escapes all interpolated values. */
export const xmlTag: TagFn = makeTag(escapeXml);
/** Tagged template literal that HTML-escapes all interpolated values. */
export const htmlTag: TagFn = makeTag(escapeHtml);
/** Tagged template literal that JSON-serializes all interpolated values. */
export const jsonTag: TagFn = makeTag(escapeJson);
