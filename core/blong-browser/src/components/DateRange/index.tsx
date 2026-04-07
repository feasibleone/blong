/**
 * DateRange — date range picker with relative presets.
 */
import {Button} from 'primereact/button';
import {Calendar} from 'primereact/calendar';
import {useState} from 'react';

export type DateRangePreset =
    | 'Last30min'
    | 'Last1h'
    | 'Last24h'
    | 'Last7d'
    | 'Last1m'
    | 'Last3m'
    | 'Last6m'
    | 'Last1y';

export interface IDateRangeValue {
    from: Date | null;
    to: Date | null;
}

interface IDateRangeProps {
    value?: IDateRangeValue;
    onChange?: (value: IDateRangeValue) => void;
    exclusive?: boolean;
    timeOnly?: boolean;
    presets?: DateRangePreset[];
    className?: string;
}

const PRESET_LABELS: Record<DateRangePreset, string> = {
    Last30min: '30m',
    Last1h: '1h',
    Last24h: '24h',
    Last7d: '7d',
    Last1m: '1M',
    Last3m: '3M',
    Last6m: '6M',
    Last1y: '1Y',
};

function getPresetRange(preset: DateRangePreset): IDateRangeValue {
    const now = new Date();
    const MINUTE = 60 * 1000;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;
    const offsets: Record<DateRangePreset, number> = {
        Last30min: 30 * MINUTE,
        Last1h: HOUR,
        Last24h: DAY,
        Last7d: 7 * DAY,
        Last1m: 30 * DAY,
        Last3m: 90 * DAY,
        Last6m: 180 * DAY,
        Last1y: 365 * DAY,
    };
    return {from: new Date(now.getTime() - offsets[preset]), to: now};
}

export function DateRange({
    value,
    onChange,
    exclusive: _exclusive,
    timeOnly,
    presets = ['Last24h', 'Last7d', 'Last1m', 'Last3m'],
    className,
}: IDateRangeProps) {
    const [internal, setInternal] = useState<IDateRangeValue>(value ?? {from: null, to: null});
    const current = value ?? internal;

    const handleChange = (next: IDateRangeValue) => {
        setInternal(next);
        onChange?.(next);
    };

    return (
        <div className={`blong-date-range ${className ?? ''}`}>
            <Calendar
                value={current.from}
                onChange={e => handleChange({...current, from: e.value as Date | null})}
                showTime={timeOnly}
                timeOnly={timeOnly}
                placeholder="From"
                showIcon
                className="blong-date-range__from"
            />
            <span className="blong-date-range__separator">–</span>
            <Calendar
                value={current.to}
                onChange={e => handleChange({...current, to: e.value as Date | null})}
                showTime={timeOnly}
                timeOnly={timeOnly}
                placeholder="To"
                showIcon
                className="blong-date-range__to"
            />
            {presets.length > 0 && (
                <div className="blong-date-range__presets">
                    {presets.map(preset => (
                        <Button
                            key={preset}
                            label={PRESET_LABELS[preset]}
                            size="small"
                            outlined
                            className="blong-date-range__preset-btn"
                            onClick={() => handleChange(getPresetRange(preset))}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
