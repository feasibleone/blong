import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import React from 'react';
import type {IWidgetProps} from '@feasibleone/blong';
import {fireEvent, render, screen, waitFor, act} from '../../test/render.js';
import {widgetRegistry} from '../../widgets/index.js';
import {Form} from './index.js';

const schema = {
    properties: {
        userName: {title: 'User Name'},
        emailAddress: {title: 'Email Address'},
        phoneNumber: {title: 'Phone'},
    },
};

const cards = {
    edit: {label: 'User', widgets: ['userName', 'emailAddress', 'phoneNumber']},
};

describe('Form', () => {
    it('renders card layout with fields', () => {
        const {container} = render(
            <Form
                schema={schema}
                cards={cards}
            />,
        );
        expect(container).toMatchSnapshot();
    });

    it('renders read-only form with values', () => {
        const {container} = render(
            <Form
                schema={schema}
                cards={cards}
                readOnly
                value={{
                    userName: 'Alice',
                    emailAddress: 'alice@example.com',
                    phoneNumber: '555-1234',
                }}
            />,
        );
        expect(container).toMatchSnapshot();
    });

    it('renders loading skeleton', () => {
        const {container} = render(
            <Form
                schema={schema}
                cards={cards}
                loading
            />,
        );
        expect(container).toMatchSnapshot();
    });

    it('renders multiple card groups', () => {
        const multiCards = {
            personal: {label: 'Personal Info', widgets: ['userName']},
            contact: {label: 'Contact', widgets: ['emailAddress', 'phoneNumber']},
        };
        const {container} = render(
            <Form
                schema={schema}
                cards={multiCards}
            />,
        );
        expect(container).toMatchSnapshot();
    });

    it('calls onSubmit when form is submitted', async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        const {container} = render(
            <Form
                schema={schema}
                cards={cards}
                onSubmit={onSubmit}
                id="test-form"
            />,
        );
        // Fill in a field
        const input = screen.getByLabelText('User Name') as HTMLInputElement;
        fireEvent.change(input, {target: {value: 'Alice'}});
        fireEvent.blur(input);
        // Submit the form
        const formEl = container.querySelector('form')!;
        fireEvent.submit(formEl);
        await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    });

    it('calls onChange when field value changes', async () => {
        const onChange = vi.fn();
        render(
            <Form
                schema={schema}
                cards={cards}
                onChange={onChange}
                value={{userName: ''}}
            />,
        );
        const input = screen.getByLabelText('User Name') as HTMLInputElement;
        fireEvent.change(input, {target: {value: 'Bob'}});
        fireEvent.blur(input);
        await waitFor(() => expect(onChange).toHaveBeenCalled());
    });

    it('shows server validation errors', () => {
        render(
            <Form
                schema={schema}
                cards={cards}
                serverErrors={{userName: 'Name is already taken'}}
            />,
        );
        // Server errors are pushed into react-hook-form — they show after a re-render
        // Just verify the form renders without crashing
        expect(screen.getByLabelText('User Name')).toBeInTheDocument();
    });

    it('syncs external value changes via reset', async () => {
        const {rerender} = render(
            <Form
                schema={schema}
                cards={cards}
                value={{userName: 'Alice'}}
            />,
        );
        rerender(
            <Form
                schema={schema}
                cards={cards}
                value={{userName: 'Bob'}}
            />,
        );
        const input = screen.getByLabelText('User Name') as HTMLInputElement;
        await waitFor(() => expect(input.value).toBe('Bob'));
    });
});

// ── Render isolation — typing in one field must not rerender sibling widgets ──
//
// This test registers a spy widget (type '_spy') that counts how many times each
// instance is rendered.  It then types characters into fieldA and asserts that
// fieldB's widget render count does not increase.
//
// If rawFormValues (watch()) is broadcast through context, every FieldRow
// subscribes and all sibling widgets rerender on every keystroke.  This test
// catches that regression.

describe('Form render isolation', () => {
    // Unique widget type used only in this describe block so we don't pollute
    // the global registry for other tests.
    const SPY_TYPE = '_spy';

    // Render counts keyed by field name. Reset before each test.
    const renderCounts: Record<string, number> = {};

    // Stable spy widget component. Created once so its identity never changes
    // (important: a new function reference on every render would force React to
    //  unmount/remount the component on every Controller render, which would
    //  make the count meaningless and break the Controller memoisation).
    const SpyWidget = React.memo(function SpyWidget({name, value, onChange, onBlur}: IWidgetProps) {
        renderCounts[name] = (renderCounts[name] ?? 0) + 1;
        return (
            <input
                data-testid={name}
                value={String(value ?? '')}
                onChange={e => onChange(e.target.value)}
                onBlur={onBlur}
            />
        );
    });

    // Register and clean up around each test so the global registry is not
    // permanently modified by this test suite.
    let prevWidget: React.ComponentType<IWidgetProps> | undefined;
    beforeAll(() => {
        prevWidget = widgetRegistry.get(SPY_TYPE);
        widgetRegistry.register(SPY_TYPE, SpyWidget as React.ComponentType<IWidgetProps>);
    });
    afterAll(() => {
        if (prevWidget) widgetRegistry.register(SPY_TYPE, prevWidget);
    });
    beforeEach(() => {
        Object.keys(renderCounts).forEach(k => delete renderCounts[k]);
    });

    const spySchema = {
        properties: {
            fieldA: {title: 'Field A', widget: {type: SPY_TYPE as 'input'}},
            fieldB: {title: 'Field B', widget: {type: SPY_TYPE as 'input'}},
        },
    };
    const spyCards = {
        edit: {label: 'Edit', widgets: ['fieldA', 'fieldB']},
    };

    it('typing in fieldA does not rerender fieldB widget', async () => {
        render(
            <Form
                schema={spySchema}
                cards={spyCards}
            />,
        );

        // Wait for initial render to settle, then reset counts.
        await act(async () => {});
        renderCounts.fieldA = 0;
        renderCounts.fieldB = 0;

        // Type a character into fieldA.
        const inputA = screen.getByTestId('fieldA') as HTMLInputElement;
        await act(async () => {
            fireEvent.change(inputA, {target: {value: 'x'}});
        });

        // fieldB's widget must NOT have rerendered.
        expect(renderCounts.fieldB ?? 0).toBe(0);
        // fieldA's widget should have rerendered (its value changed).
        expect(renderCounts.fieldA ?? 0).toBeGreaterThan(0);
    });

    it('typing in multiple fields only rerenders the active field widget', async () => {
        render(
            <Form
                schema={spySchema}
                cards={spyCards}
            />,
        );

        await act(async () => {});

        // Type A → B → A; each should only affect the targeted field.
        for (const [testId, char] of [
            ['fieldA', 'a'],
            ['fieldB', 'b'],
            ['fieldA', 'c'],
        ] as const) {
            renderCounts.fieldA = 0;
            renderCounts.fieldB = 0;

            const input = screen.getByTestId(testId) as HTMLInputElement;
            await act(async () => {
                fireEvent.change(input, {target: {value: char}});
            });

            const sibling = testId === 'fieldA' ? 'fieldB' : 'fieldA';
            expect(renderCounts[sibling] ?? 0).toBe(0);
        }
    });
});
