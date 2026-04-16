/**
 * DateRange — date range picker with relative presets.
 *
 * value format: JSON string "[dateFrom, dateTo]" or a relative string like "now-1h".
 * onChange fires: { value: [Date, Date] }
 */
import {Calendar, OverlayPanel} from '../../primereact/index.js';

import React, {useRef, useState} from 'react';
import {Button} from '../Button/index.js';

/** @deprecated Use string-based value format instead */
export interface IDateRangeValue {
    from: Date | null;
    to: Date | null;
}

export interface IDateRangeProps {
    /** JSON string "[dateFrom, dateTo]", a relative string like "now-1h", or null/undefined */
    value?: string | null;
    onChange?: (event: {value: [Date, Date]}) => void;
    exclusive?: boolean;
    timeOnly?: boolean;
    className?: string;
    disabled?: boolean;
}

// ── Relative preset definitions ─────────────────────────────────────────────

const PRESETS = [
    {from: 'now-30m', display: 'Last 30 minutes'},
    {from: 'now-1h', display: 'Last hour'},
    {from: 'now-12h', display: 'Last 12 hours'},
    {from: 'now-24h', display: 'Last 24 hours'},
    {from: 'now-1d', display: 'Today'},
    {from: 'now-2d', display: 'Since yesterday'},
    {from: 'now-7d', display: 'Last 7 days'},
    {from: 'now-1M', display: 'Last month'},
    {from: 'now-3M', display: 'Last 3 months'},
    {from: 'now-6M', display: 'Last 6 months'},
    {from: 'now-1y', display: 'Last 12 months'},
    {from: 'now-2y', display: 'Last 2 years'},
    {from: 'now-5y', display: 'Last 5 years'},
];

const RELATIVE_RE = /^now-(\d+)(m|h|d|M|y)$/;

const INTERVALS: Record<string, number> = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
};

/** Parse stored JSON string value to [Date, Date] or [undefined, undefined] */
function parseValue(value?: string | null): [Date | undefined, Date | undefined] {
    if (!value) return [undefined, undefined];
    if (typeof value === 'string' && value.startsWith('[')) {
        try {
            const parsed = JSON.parse(value) as (string | null)[];
            return [
                parsed[0] ? new Date(parsed[0]) : undefined,
                parsed[1] ? new Date(parsed[1]) : undefined,
            ];
        } catch {
            return [undefined, undefined];
        }
    }
    return [undefined, undefined];
}

/** Compute [from, to] dates from a relative string like "now-1h" */
function computeRelative(relVal: string, exclusive: boolean, timeOnly: boolean): [Date, Date] {
    const match = relVal.match(RELATIVE_RE);
    if (!match) return [new Date(), new Date()];
    const interval = Number(match[1]);
    const unit = match[2];
    const newTo = timeOnly ? new Date(0) : new Date();
    const newFrom = timeOnly ? new Date(0) : new Date();
    if (['d', 'M', 'y'].includes(unit)) newFrom.setHours(0, 0, 0, 0);
    if (unit === 'm' || unit === 'h') {
        newFrom.setTime(newFrom.getTime() - interval * INTERVALS[unit]);
    } else if (unit === 'd') {
        newFrom.setTime(newFrom.getTime() - (interval - 1) * INTERVALS.d);
    } else if (unit === 'M') {
        newFrom.setMonth(newFrom.getMonth() - interval);
    } else if (unit === 'y') {
        newFrom.setFullYear(newFrom.getFullYear() - interval);
    }
    if (exclusive) newTo.setHours(23, 59, 59, 999);
    else newTo.setHours(24, 0, 0, 0);
    return [newFrom, newTo];
}

function formatDate(date: Date | undefined, timeOnly: boolean): string {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '---';
    if (timeOnly)
        return date.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

// ── Component ────────────────────────────────────────────────────────────────

export function DateRange({
    value,
    onChange,
    exclusive = false,
    timeOnly = false,
    className,
    disabled,
}: IDateRangeProps) {
    const panelRef = useRef<OverlayPanel>(null);
    const [from, setFrom] = useState<Date | undefined>(undefined);
    const [to, setTo] = useState<Date | undefined>(undefined);
    const [displayText, setDisplayText] = useState<string>('');
    const [displayFrom, setDisplayFrom] = useState<Date | undefined>(undefined);
    const [displayTo, setDisplayTo] = useState<Date | undefined>(undefined);

    const [storedFrom, storedTo] = parseValue(value);

    // Resolve relative value on mount / when value changes
    React.useEffect(() => {
        if (typeof value === 'string' && !value.startsWith('[') && RELATIVE_RE.test(value)) {
            const preset = PRESETS.find(p => p.from === value || p.display === value);
            const [f, t] = computeRelative(preset?.from ?? value, exclusive, timeOnly);
            setDisplayText(preset?.display ?? value);
            setDisplayFrom(f);
            setDisplayTo(t);
            onChange?.({value: [f, t]});
        }
        // Only run when `value` identity changes (not on every render)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const openPanel = React.useCallback(
        (e: React.SyntheticEvent) => {
            panelRef.current?.toggle(e);
            setFrom(storedFrom);
            setTo(storedTo);
            // Reset displayed preset if stored range no longer matches
            if (
                !(displayFrom && storedFrom && displayFrom.getTime() === storedFrom.getTime()) ||
                !(displayTo && storedTo && displayTo.getTime() === storedTo.getTime())
            ) {
                setDisplayText('');
            }
        },
        [storedFrom, storedTo, displayFrom, displayTo],
    );

    const applyRange = (e: React.SyntheticEvent) => {
        panelRef.current?.toggle(e);
        if (!from || !to) return;
        onChange?.({value: [from, to]});
    };

    const applyPreset = React.useCallback(
        (preset: {from: string; display: string}, e: React.SyntheticEvent) => {
            const [f, t] = computeRelative(preset.from, exclusive, timeOnly);
            setDisplayText(preset.display);
            setDisplayFrom(f);
            setDisplayTo(t);
            panelRef.current?.toggle(e);
            onChange?.({value: [f, t]});
        },
        [exclusive, timeOnly, onChange],
    );

    const buttonLabel = (() => {
        if (!storedFrom && !storedTo) return 'Select period';
        if (
            displayFrom &&
            storedFrom &&
            displayFrom.getTime() === storedFrom.getTime() &&
            displayTo &&
            storedTo &&
            displayTo.getTime() === storedTo.getTime() &&
            displayText
        )
            return displayText;
        return 'Custom period';
    })();

    const tooltip =
        storedFrom || storedTo
            ? `${formatDate(storedFrom, timeOnly)}\n÷\n${formatDate(storedTo, timeOnly)}`
            : undefined;

    return (
        <div className={`blong-date-range w-full ${className ?? ''}`}>
            <Button
                type="button"
                tooltip={tooltip}
                tooltipOptions={{className: 'text-center', event: 'both', position: 'top'}}
                disabled={disabled}
                onClick={openPanel}
                className="blong-date-range__btn w-full"
            >
                {buttonLabel}
            </Button>
            <OverlayPanel
                ref={panelRef}
                showCloseIcon
            >
                <div className="flex gap-3">
                    <div className="card">
                        <div className="field">
                            <label htmlFor="blongDRFrom">From</label>
                            <Calendar
                                inputId="blongDRFrom"
                                value={from}
                                onChange={e => setFrom(e.value as Date | undefined)}
                                timeOnly={timeOnly}
                                showTime={!timeOnly}
                                showSeconds
                                showIcon
                            />
                        </div>
                        <div className="field">
                            <label htmlFor="blongDRTo">To</label>
                            <Calendar
                                inputId="blongDRTo"
                                value={to}
                                minDate={from}
                                onChange={e => setTo(e.value as Date | undefined)}
                                timeOnly={timeOnly}
                                showTime={!timeOnly}
                                showSeconds
                                showIcon
                            />
                        </div>
                        <Button
                            type="button"
                            onClick={applyRange}
                            disabled={!from || !to}
                        >
                            Apply Time Range
                        </Button>
                    </div>
                    {!timeOnly && (
                        <div className="blong-date-range__presets">
                            {PRESETS.map(preset => (
                                <div
                                    key={preset.from}
                                    className="blong-date-range__preset-item cursor-pointer p-2"
                                    onClick={e =>
                                        applyPreset(preset, e as unknown as React.SyntheticEvent)
                                    }
                                >
                                    {preset.display}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </OverlayPanel>
        </div>
    );
}
