/**
 * Code colouring for the transcript, by a small tokenizer rather than a hand-written scanner
 * (`@@T-799`, `@@D-1011`).
 *
 * A session's code blocks are short but in whatever language the engine happened to work in, and a
 * scanner that knew five of them coloured the rest flat. `@speed-highlight/core` is ~1.5 kB of core
 * plus a few hundred bytes per language, ships no dependencies, and its `tokenizeWith` is
 * synchronous with the grammars passed by the caller, so nothing is loaded on demand and a fence
 * never renders flat for a frame while its grammar arrives. A language the package does not carry is
 * still one plain run per line.
 *
 * The tokens stay data: the callback receives `(text, type)` and this module maps the type to a
 * kind, so the renderer keeps building spans and never builds a string of HTML. A fence that
 * contains markup therefore cannot become markup.
 *
 * The grammars come in as one registry rather than one subpath per language. The package exports
 * every grammar under `languages/*.js`, but that pattern subpath does not resolve under this repo's
 * test loader, so a per-language import is a bundle the unit suite cannot even load (`@@F-838`).
 * The registry is all 34 grammars, ~9 kB gzipped, which is the price of the whole feature being one
 * import and no second render (`@@D-1011`).
 */
import * as languages from '@speed-highlight/core/languages';
import {tokenizeWith} from '@speed-highlight/core/tokenize';

export type CodeTokenKind =
    | 'plain'
    | 'comment'
    | 'string'
    | 'number'
    | 'keyword'
    | 'builtin'
    | 'variable'
    | 'type'
    | 'tag'
    | 'attribute'
    | 'punctuation'
    | 'insert'
    | 'deleted'
    | 'error';

export interface ICodeToken {
    kind: CodeTokenKind;
    text: string;
}

/** The spelling of a language people write in a fence, and the name its grammar is filed under. */
const ALIASES: Record<string, string> = {
    sh: 'bash',
    shell: 'bash',
    'shell-session': 'bash',
    zsh: 'bash',
    console: 'bash',
    bash: 'bash',
    js: 'js',
    mjs: 'js',
    cjs: 'js',
    jsx: 'js',
    javascript: 'js',
    node: 'js',
    ts: 'ts',
    tsx: 'ts',
    typescript: 'ts',
    json: 'json',
    jsonc: 'json',
    json5: 'json',
    html: 'html',
    htm: 'html',
    xml: 'xml',
    svg: 'xml',
    css: 'css',
    scss: 'css',
    sass: 'css',
    less: 'css',
    md: 'md',
    markdown: 'md',
    mdown: 'md',
    yml: 'yaml',
    yaml: 'yaml',
    py: 'py',
    python: 'py',
    python3: 'py',
    rust: 'rs',
    patch: 'diff',
    udiff: 'diff',
    dockerfile: 'docker',
    containerfile: 'docker',
    toml: 'toml',
    ini: 'ini',
    conf: 'ini',
    log: 'log',
    text: 'plain',
    txt: 'plain',
    plaintext: 'plain',
};

/** What a token the tokenizer named is, in the vocabulary the stylesheet colours. */
const KIND_OF: Record<string, CodeTokenKind> = {
    kwd: 'keyword',
    bool: 'keyword',
    cmnt: 'comment',
    str: 'string',
    esc: 'string',
    num: 'number',
    func: 'builtin',
    type: 'type',
    class: 'type',
    var: 'variable',
    section: 'variable',
    oper: 'punctuation',
    insert: 'insert',
    deleted: 'deleted',
    err: 'error',
};

/**
 * The two grammars whose `var` token is not a variable.
 *
 * A JSON key and an HTML tag are the things a reader scans for, and colouring them as variables puts
 * them in the same colour as a CSS property. Three entries is cheaper than a grammar of our own.
 */
const KIND_BY_LANGUAGE: Record<string, Record<string, CodeTokenKind>> = {
    json: {var: 'attribute'},
    html: {var: 'tag'},
    xml: {var: 'tag'},
};

/** What a token of this grammar is, in the vocabulary the stylesheet colours. */
const kindOf = (name: string, type: string): CodeTokenKind =>
    KIND_BY_LANGUAGE[name]?.[type] ?? KIND_OF[type] ?? 'plain';

export const normaliseLanguage = (language: string): string => {
    const name = language.trim().toLowerCase();
    return ALIASES[name] ?? name;
};

/** One token's text, split where it breaks a line, so a block comment spans rows rather than one. */
const appendToken = (lines: ICodeToken[][], kind: CodeTokenKind, text: string): void => {
    const parts = text.split('\n');
    for (const [index, part] of parts.entries()) {
        if (index > 0) lines.push([]);
        if (part === '') continue;
        (lines[lines.length - 1] as ICodeToken[]).push({kind, text: part});
    }
};

/**
 * The source coloured, one array of tokens per line.
 *
 * The whole fence is tokenized in one call — a comment or a template literal that spans lines is
 * only a comment if the run knows the line before it — and the stream is then cut at the newlines it
 * carries, so the renderer's per-line shape does not cost correctness.
 */
export const highlightLines = (language: string, source: string): ICodeToken[][] => {
    const name = normaliseLanguage(language);
    const lines: ICodeToken[][] = [[]];
    // A name the registry does not hold comes back as the whole source, one plain token, which is
    // the answer this page wants for a language it was not taught.
    tokenizeWith(
        source,
        name === '' ? 'plain' : name,
        (text, type) => {
            appendToken(lines, kindOf(name, type ?? 'plain'), text);
        },
        {languages},
    );
    return lines;
};

/** A short label for a fence: the normalised name, or `text` when it named nothing. */
export const languageLabel = (language: string): string => {
    const name = normaliseLanguage(language);
    return name === '' || name === 'plain' ? 'text' : name;
};
