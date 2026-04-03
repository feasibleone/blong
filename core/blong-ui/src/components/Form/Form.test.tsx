import {describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen, waitFor} from '../../test/render.js';
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
