/**
 * What else a record can say: the branch it reports, the flow it belongs to, who asked for it, and what
 * caused it.
 *
 * A line is not only a sentence. lukaot hands a reader a `decision` (the rationale a branch was chosen
 * on), a `flow` (the run, the step and the call this record is part of), an `intent` (on whose behalf
 * the work ran) and `refs.parent` (the record that caused this one). The viewer drew none of them, so a
 * record's most useful half was invisible while the JSON beside it showed the raw object (`@@D-926`).
 *
 * They are drawn as one **strip of chips** at the top of an expanded row and, for a decision, a panel
 * under it — the chips because each is a single fact (a name, a counter, an arrow), the panel because
 * the candidates are a list and the chosen one has to be findable in it.
 */

import React, {type CSSProperties} from 'react';

import {
    decisionOf,
    flowOf,
    intentOf,
    parentOf,
    type IDecisionView,
    type IExchangeView,
    type IFlowView,
    type IIntentView,
} from '../record.ts';
import type {LogEntry, ThemeConfig} from '../types.ts';
import {highlightSearch, SyntaxHighlight} from './Highlight.tsx';

/** A fact drawn as a small rounded label; `onClick` makes it a filter. */
function Chip({
    label,
    title,
    tone,
    isDark,
    onClick,
}: {
    label: string;
    title?: string;
    tone: 'intent' | 'flow' | 'parent' | 'decision';
    isDark: boolean;
    onClick?: () => void;
}): React.ReactElement {
    const tones = {
        intent: {dark: '#8957e5', light: '#e6dcff', inkDark: '#e6dcff', inkLight: '#5a32a3'},
        flow: {dark: '#1f6feb', light: '#ddf4ff', inkDark: '#c9d1d9', inkLight: '#0969da'},
        parent: {dark: '#30363d', light: '#eef2f6', inkDark: '#c9d1d9', inkLight: '#24292f'},
        decision: {dark: '#9e6a03', light: '#fff4d6', inkDark: '#ffd33d', inkLight: '#7d4e00'},
    } as const;
    const tone_ = tones[tone];
    return (
        <span
            title={title ?? label}
            onClick={
                onClick === undefined
                    ? undefined
                    : (e: React.MouseEvent) => {
                          e.stopPropagation();
                          onClick();
                      }
            }
            style={{
                fontSize: '10px',
                lineHeight: '14px',
                padding: '1px 6px',
                borderRadius: '3px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                whiteSpace: 'nowrap',
                background: isDark ? tone_.dark : tone_.light,
                color: isDark ? tone_.inkDark : tone_.inkLight,
                cursor: onClick === undefined ? 'default' : 'pointer',
            }}
        >
            {label}
        </span>
    );
}

/** The flow facts worth a chip: the process and step, the call and its ends, how the run stood. */
function flowChips(flow: IFlowView): Array<{label: string; title: string}> {
    const chips: Array<{label: string; title: string}> = [];
    const process = [flow.kind, flow.step].filter((part): part is string => part !== undefined);
    if (process.length > 0)
        chips.push({label: process.join(' · '), title: 'the flow and the step this record is in'});
    if (flow.leg !== undefined) {
        const ends =
            flow.from === undefined && flow.to === undefined
                ? flow.leg
                : `${flow.from ?? '?'} → ${flow.to ?? '?'}`;
        const seq = flow.seq === undefined ? '' : ` · ${flow.seq}`;
        chips.push({
            label: `${ends}${seq}`,
            title: 'the call this record is one end of, and its position in the execution',
        });
    }
    if (flow.status !== undefined)
        chips.push({label: flow.status, title: 'how the run stood here'});
    return chips;
}

function intentChip(intent: IIntentView): {label: string; title: string} {
    const who = [intent.actor, intent.tenant].filter((part): part is string => !!part).join('@');
    const priority = intent.priority === undefined ? '' : ` · p${intent.priority}`;
    return {
        label: `${intent.name}${who === '' ? '' : ` (${who})`}${priority}`,
        title: 'who asked for this work',
    };
}

/**
 * The facts a row carries beside its sentence, as one line of chips.
 *
 * Every chip that names an identifier is a **filter**: clicking the flow id asks the table for the rest
 * of that run, clicking the parent asks it for the record that caused this one. That is what turns the
 * line into a place to start reading from rather than a datum to copy out.
 */
export function RecordContextStrip({
    record,
    theme,
    onFilter,
}: {
    record: LogEntry;
    theme: ThemeConfig;
    onFilter: (text: string) => void;
}): React.ReactElement | null {
    const isDark = theme.mode !== 'light';
    const intent = intentOf(record);
    const flow = flowOf(record);
    const decision = decisionOf(record);
    const parent = parentOf(record);

    const chips: React.ReactElement[] = [];
    if (intent !== undefined) {
        const {label, title} = intentChip(intent);
        chips.push(
            <Chip
                key="intent"
                label={label}
                title={title}
                tone="intent"
                isDark={isDark}
                onClick={() => onFilter(intent.name)}
            />,
        );
    }
    if (flow !== undefined) {
        for (const {label, title} of flowChips(flow))
            chips.push(
                <Chip
                    key={`flow-${label}`}
                    label={label}
                    title={title}
                    tone="flow"
                    isDark={isDark}
                    onClick={() => onFilter(flow.id)}
                />,
            );
        chips.push(
            <Chip
                key="flow-run"
                label={`run ${flow.id.slice(0, 8)}…`}
                title={`show every record of run ${flow.id}`}
                tone="flow"
                isDark={isDark}
                onClick={() => onFilter(flow.id)}
            />,
        );
    }
    if (decision !== undefined) {
        chips.push(
            <Chip
                key="decision"
                label={`⚖ ${decision.discriminator}${decision.chosen === undefined ? '' : ` → ${decision.chosen}`}`}
                title="the branch this record explains"
                tone="decision"
                isDark={isDark}
                onClick={() => onFilter(decision.discriminator)}
            />,
        );
    }
    if (parent !== undefined) {
        chips.push(
            <Chip
                key="parent"
                label={`⤴ ${parent.slice(0, 8)}…`}
                title={`show the record that caused this one (${parent})`}
                tone="parent"
                isDark={isDark}
                onClick={() => onFilter(parent)}
            />,
        );
    }

    if (chips.length === 0) return null;
    return (
        <div
            style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '4px',
                alignItems: 'center',
                marginBottom: '4px',
            }}
        >
            {chips}
        </div>
    );
}

/**
 * The decision a record reports: what the branch was about, what it chose between, and what it chose.
 *
 * The candidates are listed **in evaluation order** and the chosen one is marked, because the order is
 * the rule: a reader checking "why this branch" is reading the precedence, and a list sorted for looks
 * would answer a different question. The values are often absent — they are retained locally rather than
 * transmitted — which the panel says instead of drawing an empty block.
 */
export function DecisionPanel({
    decision,
    theme,
}: {
    decision: IDecisionView;
    theme: ThemeConfig;
}): React.ReactElement {
    const isDark = theme.mode !== 'light';
    const mono: CSSProperties = {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '10px',
        lineHeight: '15px',
    };
    return (
        <div
            data-decision={decision.discriminator}
            style={{
                marginTop: '4px',
                padding: '4px 8px',
                borderRadius: '4px',
                borderLeft: `3px solid ${isDark ? '#9e6a03' : '#bf8700'}`,
                background: isDark ? '#161b22' : '#fffbef',
                ...mono,
            }}
        >
            <div style={{marginBottom: '2px'}}>
                <span style={{color: isDark ? '#ffd33d' : '#7d4e00'}}>
                    {decision.discriminator}
                </span>
            </div>
            {decision.candidates.length === 0 ? (
                <div style={{fontStyle: 'italic', color: isDark ? '#8b949e' : '#57606a'}}>
                    the branch reported no candidates
                </div>
            ) : (
                <div>
                    {decision.candidates.map(candidate => {
                        const chosen = candidate === decision.chosen;
                        return (
                            <div
                                key={candidate}
                                style={{
                                    color: chosen
                                        ? isDark
                                            ? '#7ee787'
                                            : '#116329'
                                        : isDark
                                          ? '#8b949e'
                                          : '#57606a',
                                    fontWeight: chosen ? 'bold' : 'normal',
                                }}
                            >
                                {chosen ? '✓ ' : '· '}
                                {candidate}
                            </div>
                        );
                    })}
                </div>
            )}
            {decision.values !== undefined ? (
                <div style={{marginTop: '2px'}}>
                    <SyntaxHighlight
                        json={JSON.stringify(decision.values, null, 2)}
                        theme={theme}
                    />
                </div>
            ) : (
                <div style={{fontStyle: 'italic', color: isDark ? '#8b949e' : '#57606a'}}>
                    the values it was decided from stayed in the process that decided
                </div>
            )}
        </div>
    );
}

/**
 * The HTTP exchange a record reports, as the two blocks it always was.
 *
 * A request block and a response block, each with its own tint and a bar down the left: the request's is
 * blue, the response's follows its status. The status and the time it took head the response block
 * (`200 (45ms)`), which is where a reader looks for them, and the bodies are labelled because a block
 * with two payloads and no words is a guess.
 *
 * What changed is only **how they are read**: the panel used to take `method`/`url` and
 * `statusCode`/`responseTime`, so a lukaot record — `operation`/`target`, `status`/`elapsedMs` — drew an
 * empty request line and no status at all. `exchangeOf` reads both spellings; the picture is the one
 * that was already good (`@@D-926`).
 */
export function ExchangePanel({
    exchange,
    theme,
    searchText = '',
}: {
    exchange: IExchangeView;
    theme: ThemeConfig;
    searchText?: string;
}): React.ReactElement {
    const isDark = theme.mode !== 'light';
    const status = exchange.status;
    const ok = (status ?? 200) < 400;
    const statusColour = ok ? '#22c55e' : '#ef4444';
    const headers = (
        bag: Record<string, string> | undefined,
        colour: string,
    ): React.ReactElement | null =>
        bag === undefined ? null : (
            <div style={{fontSize: '10px', marginTop: '4px'}}>
                {Object.entries(bag).map(([key, value]) => (
                    <div key={key}>
                        <span style={{color: colour}}>{key + ':'}</span>{' '}
                        {highlightSearch(String(value), searchText)}
                    </div>
                ))}
            </div>
        );
    const body = (
        value: unknown,
        label: string,
        colour: string,
        tint: string,
    ): React.ReactElement | null =>
        value === undefined ? null : (
            <div
                style={{
                    marginTop: '6px',
                    fontSize: '10px',
                    lineHeight: '15px',
                    background: isDark ? '#161b22' : tint,
                    padding: '6px',
                    borderRadius: '3px',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
            >
                <div style={{color: colour, marginBottom: '3px'}}>{label}</div>
                <div style={{whiteSpace: 'pre-wrap'}}>
                    <SyntaxHighlight
                        json={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                        theme={theme}
                        searchText={searchText}
                    />
                </div>
            </div>
        );

    return (
        <div data-exchange="">
            {exchange.request !== undefined && (
                <div
                    style={{
                        marginTop: '4px',
                        padding: '6px 8px',
                        background: isDark ? '#1c2128' : '#f0f6ff',
                        borderLeft: '3px solid #1f6feb',
                        borderRadius: '4px',
                    }}
                >
                    <div style={{fontWeight: 'bold', marginBottom: '4px', fontSize: '11px'}}>
                        {highlightSearch(exchange.request, searchText)}
                    </div>
                    {headers(exchange.requestHeaders, isDark ? '#79c0ff' : '#0969da')}
                    {body(
                        exchange.requestBody,
                        'Request Body:',
                        isDark ? '#79c0ff' : '#0969da',
                        '#e8f0ff',
                    )}
                </div>
            )}
            <div
                style={{
                    marginTop: '4px',
                    padding: '6px 8px',
                    background: isDark ? '#1c2128' : '#f0fff4',
                    borderLeft: `3px solid ${statusColour}`,
                    borderRadius: '4px',
                }}
            >
                <div style={{fontWeight: 'bold', fontSize: '11px'}}>
                    <span style={{color: statusColour}}>{status ?? 200}</span>
                    {exchange.elapsedMs === undefined ? '' : ` (${exchange.elapsedMs}ms)`}
                </div>
                {headers(exchange.responseHeaders, statusColour)}
                {body(exchange.responseBody, 'Response Body:', statusColour, '#e8fff0')}
            </div>
        </div>
    );
}
