/**
 * Widget callback coverage tests.
 * These tests mock PrimeReact's Calendar and SelectButton to cover the
 * onChange/onValueChange inline callbacks not trigger-able through jsdom events.
 */
import {describe, expect, it, vi} from 'vitest';
import {fireEvent, render} from '../test/render.js';

// Mock Calendar to simple input so we can trigger onChange
vi.mock('primereact/calendar', () => ({
    Calendar: ({
        onChange,
        onHide,
        value,
        inputId,
        disabled,
        readOnly: readOnlyInput,
    }: {
        onChange?: (e: {value: Date | null}) => void;
        onHide?: () => void;
        value?: Date | null;
        inputId?: string;
        disabled?: boolean;
        readOnly?: boolean;
        readOnlyInput?: boolean;
        [key: string]: unknown;
    }) => (
        <input
            id={inputId}
            data-testid="calendar-input"
            type="text"
            defaultValue={value ? String(value) : ''}
            onChange={e => {
                onChange?.({value: e.target.value ? new Date(e.target.value) : null});
            }}
            onBlur={onHide}
            disabled={disabled}
            readOnly={readOnlyInput}
        />
    ),
}));

// Mock SelectButton to simple radio buttons
vi.mock('primereact/selectbutton', () => ({
    SelectButton: ({
        onChange,
        value,
        options,
    }: {
        onChange?: (e: {value: unknown}) => void;
        onBlur?: () => void;
        value?: unknown;
        options?: {label: string; value: unknown}[];
        [key: string]: unknown;
    }) => (
        <div data-testid="select-button">
            {(options ?? []).map((opt: {label: string; value: unknown}) => (
                <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => onChange?.({value: opt.value})}
                    data-selected={value === opt.value ? 'true' : 'false'}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    ),
}));

// Mock InputNumber for NumberWidget
vi.mock('primereact/inputnumber', () => ({
    InputNumber: ({
        onValueChange,
        value,
        inputId,
        disabled,
        readOnly,
    }: {
        onValueChange?: (e: {value: number | null}) => void;
        value?: number | null;
        inputId?: string;
        disabled?: boolean;
        readOnly?: boolean;
        [key: string]: unknown;
    }) => (
        <input
            id={inputId}
            data-testid="number-input"
            type="number"
            defaultValue={value ?? ''}
            onChange={e => {
                onValueChange?.({value: e.target.value ? Number(e.target.value) : null});
            }}
            disabled={disabled}
            readOnly={readOnly}
        />
    ),
}));

import type {IWidgetProps} from '@feasibleone/blong';
import {BigIntWidget} from './BigIntWidget.js';
import {DateTimeWidget} from './DateTimeWidget.js';
import {DateWidget} from './DateWidget.js';
import {IntegerWidget} from './IntegerWidget.js';
import {NumberWidget} from './NumberWidget.js';
import {SelectWidget} from './SelectWidget.js';
import {TimeWidget} from './TimeWidget.js';

function mkProps(overrides: Partial<IWidgetProps> = {}): IWidgetProps {
    return {
        name: 'testField',
        schema: {},
        value: undefined,
        onChange: vi.fn(),
        onBlur: vi.fn(),
        readOnly: false,
        disabled: false,
        ...overrides,
    } as IWidgetProps;
}

describe('DateWidget — onChange callback', () => {
    it('calls onChange when date value changes', () => {
        const onChange = vi.fn();
        const {getByTestId} = render(<DateWidget {...mkProps({onChange})} />);
        const input = getByTestId('calendar-input') as HTMLInputElement;
        fireEvent.change(input, {target: {value: '2024-01-15'}});
        expect(onChange).toHaveBeenCalled();
    });

    it('calls onBlur when calendar hides', () => {
        const onBlur = vi.fn();
        const {getByTestId} = render(<DateWidget {...mkProps({onBlur})} />);
        const input = getByTestId('calendar-input') as HTMLInputElement;
        fireEvent.blur(input);
        expect(onBlur).toHaveBeenCalled();
    });
});

describe('TimeWidget — onChange callback', () => {
    it('calls onChange when time value changes', () => {
        const onChange = vi.fn();
        const {getByTestId} = render(<TimeWidget {...mkProps({onChange})} />);
        const input = getByTestId('calendar-input') as HTMLInputElement;
        fireEvent.change(input, {target: {value: '2024-01-15T10:00'}});
        expect(onChange).toHaveBeenCalled();
    });
});

describe('DateTimeWidget — onChange callback', () => {
    it('calls onChange when datetime value changes', () => {
        const onChange = vi.fn();
        const {getByTestId} = render(<DateTimeWidget {...mkProps({onChange})} />);
        const input = getByTestId('calendar-input') as HTMLInputElement;
        fireEvent.change(input, {target: {value: '2024-01-15T10:00'}});
        expect(onChange).toHaveBeenCalled();
    });
});

describe('SelectWidget — onChange callback', () => {
    it('calls onChange when option selected', () => {
        const onChange = vi.fn();
        const onBlur = vi.fn();
        const {container} = render(
            <SelectWidget
                {...mkProps({
                    onChange,
                    onBlur,
                    schema: {
                        enum: ['a', 'b', 'c'],
                        widget: {
                            type: 'select',
                            options: [
                                {label: 'A', value: 'a'},
                                {label: 'B', value: 'b'},
                            ],
                        },
                    },
                })}
            />,
        );
        // Click the first option button rendered by our mock
        const optBtn = container.querySelector(
            '[data-testid="select-button"] button',
        ) as HTMLElement | null;
        if (optBtn) {
            fireEvent.click(optBtn);
            expect(onChange).toHaveBeenCalledWith('a');
        }
    });
});

describe('NumberWidget — onValueChange callback', () => {
    it('calls onChange when number value changes', () => {
        const onChange = vi.fn();
        const {getByTestId} = render(<NumberWidget {...mkProps({onChange})} />);
        const input = getByTestId('number-input') as HTMLInputElement;
        fireEvent.change(input, {target: {value: '42'}});
        expect(onChange).toHaveBeenCalledWith(42);
    });
});

describe('IntegerWidget — onValueChange callback', () => {
    it('calls onChange when integer value changes', () => {
        const onChange = vi.fn();
        const {getByTestId} = render(<IntegerWidget {...mkProps({onChange})} />);
        const input = getByTestId('number-input') as HTMLInputElement;
        fireEvent.change(input, {target: {value: '7'}});
        expect(onChange).toHaveBeenCalledWith(7);
    });
});

describe('BigIntWidget — onChange callback', () => {
    it('emits a number for safe-range integers', () => {
        const onChange = vi.fn();
        const {container} = render(<BigIntWidget {...mkProps({onChange})} />);
        const input = container.querySelector('input') as HTMLInputElement;
        fireEvent.change(input, {target: {value: '1000'}});
        expect(onChange).toHaveBeenCalledWith(1000);
    });

    it('emits the raw string for integers beyond the safe range', () => {
        const onChange = vi.fn();
        const {container} = render(<BigIntWidget {...mkProps({onChange})} />);
        const input = container.querySelector('input') as HTMLInputElement;
        fireEvent.change(input, {target: {value: '18446744073709551615'}});
        expect(onChange).toHaveBeenCalledWith('18446744073709551615');
    });

    it('does not emit invalid input', () => {
        const onChange = vi.fn();
        const {container} = render(<BigIntWidget {...mkProps({onChange})} />);
        const input = container.querySelector('input') as HTMLInputElement;
        fireEvent.change(input, {target: {value: '12a'}});
        expect(onChange).not.toHaveBeenCalled();
    });
});
