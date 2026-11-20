/**
 * Marking up text: what the search matched, and what the JSON is made of.
 *
 * Both are tokenizers over a string and both are needed by two components — the record cells and the
 * capture panel — so they live here rather than in either one (`@@D-926`).
 */

import React from 'react';

import type {ThemeConfig} from '../types.ts';

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The search term marked with a highlight, or the text unchanged when there is no search. */
export function highlightSearch(text: string, search: string): React.ReactNode {
    if (!search) return text;
    const parts = text.split(new RegExp(`(${escapeRegExp(search)})`, 'gi'));
    return parts.map((part, i) =>
        part.toLowerCase() === search.toLowerCase() ? (
            <mark
                key={i} // eslint-disable-line @eslint-react/no-array-index-key
                style={{
                    background: '#e3b341',
                    color: '#000',
                    padding: '0 1px',
                    borderRadius: '2px',
                }}
            >
                {part}
            </mark>
        ) : (
            part
        ),
    );
}

/**
 * Tokenizes JSON and wraps each token with the colour from `theme.syntax`.
 * Also applies search highlighting to matching tokens.
 */
export function SyntaxHighlight({
    json,
    theme,
    searchText = '',
}: {
    json: string;
    theme: ThemeConfig;
    searchText?: string;
}): React.ReactElement {
    const tokens: React.ReactNode[] = [];
    const syntax = theme.syntax ?? {};

    // Simple JSON tokenizer using regex
    const pattern = /"(?:[^"\\]|\\.)*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}[\]:,]/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(json)) !== null) {
        // Add any whitespace before this token
        if (match.index > lastIndex) {
            const whitespace = json.substring(lastIndex, match.index);
            tokens.push(searchText ? highlightSearch(whitespace, searchText) : whitespace);
        }

        const token = match[0];
        let color: string | undefined;

        if (token === 'true' || token === 'false') {
            color = syntax.boolean;
        } else if (token === 'null') {
            color = syntax.null;
        } else if (token[0] === '"') {
            // Check if this is a key by looking ahead for a colon
            const afterToken = json.substring(pattern.lastIndex).trimStart();
            if (afterToken[0] === ':') {
                color = syntax.key;
            } else {
                color = syntax.string;
            }
        } else if (!isNaN(Number(token)) && token !== '') {
            color = syntax.number;
        } else if (/[{}[\]:,]/.test(token)) {
            color = syntax.punctuation;
        }

        const tokenContent = searchText ? highlightSearch(token, searchText) : token;

        tokens.push(
            color ? (
                <span
                    key={lastIndex}
                    style={{color}}
                >
                    {tokenContent}
                </span>
            ) : (
                tokenContent
            ),
        );

        lastIndex = pattern.lastIndex;
    }

    // Add any remaining text
    if (lastIndex < json.length) {
        const remaining = json.substring(lastIndex);
        tokens.push(searchText ? highlightSearch(remaining, searchText) : remaining);
    }

    return <>{tokens}</>;
}
