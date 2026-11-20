/**
 * One capture, drawn by the shape that produced it.
 *
 * A capture is not a message with a payload bolted on: the three shapes answer three different
 * questions and read badly when flattened into one. An **exchange** is a request/response pair and a
 * reader wants the line, the headers and the body in the order the wire carried them; a **frame** is
 * bytes and a reader wants them the way an editor shows them — offset, bytes, and their ASCII beside
 * them (`@@D-927`); a **document** is structure and a reader wants its keys before its content.
 *
 * The rung is always shown, because it explains a payload that looks truncated: a frame captured at
 * `hex` stores every byte, one captured at `line` stores none, and nothing else in the record says so.
 */

import React, {type CSSProperties} from 'react';

import {captureOf, hexDump, type ICaptureView} from '../record.ts';
import type {LogEntry, ThemeConfig} from '../types.ts';
import {SyntaxHighlight} from './Highlight.tsx';

/**
 * The panel's header: what the row does not already say.
 *
 * The identifier is the `Signal` column and the message is the declaration's sentence, so repeating
 * either here — or the shape, which is the identifier's own name — would be the row saying one thing
 * three times. What is left is what only the capture knows: the rung it was kept at, which half of an
 * exchange it is, how large it was, and the labels the shape put on it.
 */
function CaptureHeader({
    capture,
    isDark,
}: {
    capture: ICaptureView;
    isDark: boolean;
}): React.ReactElement {
    const facts = [
        capture.rung === undefined ? undefined : `rung ${capture.rung}`,
        typeof capture.fields['direction'] === 'string'
            ? String(capture.fields['direction'])
            : undefined,
        capture.bytes === undefined ? undefined : `${capture.bytes} B`,
        typeof capture.fields['method'] === 'string' ? String(capture.fields['method']) : undefined,
        typeof capture.fields['label'] === 'string' ? String(capture.fields['label']) : undefined,
    ].filter((fact): fact is string => fact !== undefined);

    return (
        <div
            style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
                alignItems: 'center',
                marginBottom: '6px',
            }}
        >
            {/* The shape heads the panel rather than sitting on a line of its own above it: it names
                what the rest of the header describes, and `tcp.frame` above a dump is a line of its own
                width taken from the detail. */}
            <span
                title={`${capture.signal} captured as ${capture.shape}`}
                style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    borderRadius: '3px',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    background: isDark ? '#1f6feb' : '#ddf4ff',
                    color: isDark ? '#c9d1d9' : '#0969da',
                }}
            >
                {capture.shape}
            </span>
            {facts.map(fact => (
                <span
                    key={fact}
                    style={{
                        fontSize: '10px',
                        padding: '1px 6px',
                        borderRadius: '3px',
                        background: isDark ? '#21262d' : '#eef2f6',
                        color: isDark ? '#c9d1d9' : '#24292f',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    }}
                >
                    {fact}
                </span>
            ))}
        </div>
    );
}

/** A header/value table, which is how a reader scans an exchange's headers. */
function HeaderTable({
    headers,
    isDark,
}: {
    headers: Record<string, string>;
    isDark: boolean;
}): React.ReactElement {
    return (
        <div
            style={{fontSize: '10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'}}
        >
            {Object.entries(headers).map(([key, value]) => (
                <div key={key}>
                    <span style={{color: isDark ? '#79c0ff' : '#0969da'}}>{key}:</span>{' '}
                    <span style={{color: isDark ? '#c9d1d9' : '#24292f'}}>{String(value)}</span>
                </div>
            ))}
        </div>
    );
}

/**
 * A frame as a hex editor draws it: the offset, sixteen bytes, then what they read as.
 *
 * The ASCII is computed from the payload rather than taken from the record: the shape writes it only
 * for the first bytes at the `hex` rung, and the bytes it does write are the whole frame, so deriving
 * it here is both complete and free. Bytes the masker withheld arrive as `00`, which reads as `.` and
 * is the honest picture — the value is gone, not hidden.
 */
function FrameDump({payload, isDark}: {payload: string; isDark: boolean}): React.ReactElement {
    const rows = hexDump(payload);
    if (rows.length === 0)
        return (
            <div
                style={{
                    fontSize: '10px',
                    fontStyle: 'italic',
                    color: isDark ? '#8b949e' : '#57606a',
                }}
            >
                the payload is not a hex dump
            </div>
        );

    const mono: CSSProperties = {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '10px',
        lineHeight: '14px',
        whiteSpace: 'pre',
    };

    // Sixteen byte columns, with a wider gap between the two halves the way every dump tool draws it —
    // the gap is what makes a sixteen-byte row countable without reading the offset twice.
    const cells = (row: string[]): string =>
        row.map((cell, index) => (index === 8 ? ` ${cell}` : cell)).join(' ');
    const width = cells(Array.from({length: 16}, () => '00')).length;
    const header = cells(
        Array.from({length: 16}, (_, index) => index.toString(16).padStart(2, '0')),
    );

    // Three columns, laid out as a grid so the header and every row are measured by the same rule: the
    // header used to be one string with spaces guessed to match the rows' flex gaps, and a guess is
    // what made the offsets sit a character off their bytes.
    const grid: CSSProperties = {
        display: 'grid',
        gridTemplateColumns: `5ch ${width}ch auto`,
        columnGap: '12px',
        alignItems: 'baseline',
    };
    const asciiColumn: CSSProperties = {
        borderLeft: `1px solid ${isDark ? '#30363d' : '#d0d7de'}`,
        paddingLeft: '12px',
    };

    return (
        <div
            style={{
                // Sized to its content rather than to the column: a row of sixteen bytes and their
                // ASCII is wider than a message column, and a dump clipped at the cell edge hides the
                // second column it exists to show. The expanded cell scrolls instead.
                display: 'inline-block',
                width: 'max-content',
                maxWidth: '100%',
                overflowX: 'auto',
                padding: '6px 8px',
                borderRadius: '4px',
                background: isDark ? '#0d1117' : '#ffffff',
                border: `1px solid ${isDark ? '#30363d' : '#d0d7de'}`,
            }}
        >
            <div
                style={{
                    ...mono,
                    ...grid,
                    color: isDark ? '#8b949e' : '#57606a',
                    borderBottom: `1px solid ${isDark ? '#30363d' : '#d0d7de'}`,
                    paddingBottom: '2px',
                }}
            >
                <span>Offset</span>
                <span>{header}</span>
                <span style={asciiColumn}>ASCII</span>
            </div>
            {rows.map(row => (
                <div
                    key={row.offset}
                    style={{...mono, ...grid}}
                >
                    <span style={{color: isDark ? '#6e7681' : '#8c959f'}}>{row.offset}</span>
                    <span style={{color: isDark ? '#ffa657' : '#953800'}}>
                        {cells(row.hex).padEnd(width)}
                    </span>
                    <span style={{...asciiColumn, color: isDark ? '#7ee787' : '#116329'}}>
                        {row.ascii}
                    </span>
                </div>
            ))}
        </div>
    );
}

/**
 * A payload that is a JSON document where it can be, and its text where it cannot.
 *
 * A document is drawn with the same highlighter the record cells use, so a captured body and a record's
 * fields read the same way; a body that is not JSON — a form post, a protocol frame, a sentence — is
 * shown as it arrived (`@@D-926`).
 */
function PayloadText({text, theme}: {text: string; theme: ThemeConfig}): React.ReactElement {
    const isDark = theme.mode !== 'light';
    let document: string | undefined;
    try {
        document = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
        // Not JSON: a form body, a protocol frame, a sentence. Shown as it arrived.
    }
    return (
        <pre
            style={{
                margin: 0,
                padding: '6px 8px',
                borderRadius: '4px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: '11px',
                lineHeight: '15px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: isDark ? '#0d1117' : '#ffffff',
                border: `1px solid ${isDark ? '#30363d' : '#d0d7de'}`,
                color: isDark ? '#c9d1d9' : '#24292f',
                maxHeight: '320px',
                overflow: 'auto',
            }}
        >
            {document === undefined ? (
                text
            ) : (
                <SyntaxHighlight
                    json={document}
                    theme={theme}
                />
            )}
        </pre>
    );
}

/** The keys a document was captured with, before any of its content. */
function KeyList({keys, isDark}: {keys: string[]; isDark: boolean}): React.ReactElement {
    return (
        <div style={{display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px'}}>
            {keys.map(key => (
                <span
                    key={key}
                    style={{
                        fontSize: '10px',
                        padding: '1px 6px',
                        borderRadius: '3px',
                        background: isDark ? '#21262d' : '#eef2f6',
                        color: isDark ? '#79c0ff' : '#0969da',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    }}
                >
                    {key}
                </span>
            ))}
        </div>
    );
}

/**
 * The capture a record carries, drawn by shape.
 *
 * An unknown shape — a realm's own renderer, a shape shipped after this viewer — falls back to the
 * payload as text rather than to nothing: the identifier and the rung are still worth reading, and a
 * viewer that refused what it does not recognise would hide the very captures an operator added it for.
 */
export function CapturePanel({
    record,
    theme,
}: {
    record: LogEntry;
    theme: ThemeConfig;
}): React.ReactElement | null {
    const capture = captureOf(record);
    if (capture === undefined) return null;
    const isDark = theme.mode !== 'light';

    const headers = capture.fields['headers'];
    const keys = capture.fields['keys'];
    const statusCode =
        typeof capture.fields['statusCode'] === 'number' ? capture.fields['statusCode'] : undefined;
    const url = typeof capture.fields['url'] === 'string' ? capture.fields['url'] : undefined;
    const phase = typeof capture.fields['phase'] === 'string' ? capture.fields['phase'] : undefined;

    return (
        <div
            data-capture={capture.shape}
            style={{
                marginTop: '4px',
                padding: '6px 8px',
                borderRadius: '4px',
                borderLeft: `3px solid ${isDark ? '#1f6feb' : '#0969da'}`,
                background: isDark ? '#161b22' : '#f6f8fa',
            }}
        >
            <CaptureHeader
                capture={capture}
                isDark={isDark}
            />
            {url !== undefined && (
                <div
                    style={{
                        fontSize: '11px',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        marginBottom: '6px',
                    }}
                >
                    {statusCode !== undefined && (
                        <span
                            style={{
                                color: statusCode < 400 ? '#22c55e' : '#ef4444',
                                marginRight: '6px',
                            }}
                        >
                            {statusCode}
                        </span>
                    )}
                    {phase === undefined ? '' : `${phase} `}
                    {url}
                </div>
            )}
            {keys !== undefined && Array.isArray(keys) && (
                <KeyList
                    keys={keys.map(String)}
                    isDark={isDark}
                />
            )}
            {headers !== undefined && typeof headers === 'object' && headers !== null && (
                <HeaderTable
                    headers={headers as Record<string, string>}
                    isDark={isDark}
                />
            )}
            {capture.shape === 'tcp.frame' && capture.payload !== undefined && (
                <FrameDump
                    payload={capture.payload}
                    isDark={isDark}
                />
            )}
            {capture.shape !== 'tcp.frame' && capture.payload !== undefined && (
                <PayloadText
                    text={capture.payload}
                    theme={theme}
                />
            )}
            {capture.payload === undefined && capture.rung === 'line' && (
                <div
                    style={{
                        fontSize: '10px',
                        fontStyle: 'italic',
                        color: isDark ? '#8b949e' : '#57606a',
                    }}
                >
                    captured at the line rung — raise it in the configuration to keep the payload
                </div>
            )}
        </div>
    );
}
