import {describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen, waitFor} from '../../test/render.js';
import {Login} from './index.js';

describe('Login', () => {
    it('renders the login form', () => {
        const {container} = render(<Login onLogin={vi.fn()} />);
        expect(container).toMatchSnapshot();
    });

    it('has username and password fields', () => {
        render(<Login onLogin={vi.fn()} />);
        expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
        expect(screen.getByLabelText('Password')).toBeInTheDocument();
    });

    it('renders with custom title', () => {
        const {container} = render(
            <Login
                onLogin={vi.fn()}
                title="Admin Login"
            />,
        );
        expect(screen.getByText('Admin Login')).toBeInTheDocument();
        expect(container).toMatchSnapshot();
    });

    it('renders with external error', () => {
        const {container} = render(
            <Login
                onLogin={vi.fn()}
                error="Invalid credentials"
            />,
        );
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
        expect(container).toMatchSnapshot();
    });

    it('shows validation error when submitting empty form', async () => {
        render(<Login onLogin={vi.fn()} />);
        const submitBtn = screen.getByRole('button', {name: /^login$/i});
        fireEvent.click(submitBtn);
        await waitFor(() => {
            expect(screen.getByText('Username is required')).toBeInTheDocument();
        });
    });

    it('shows password validation error when username is filled', async () => {
        render(<Login onLogin={vi.fn()} />);
        const usernameInput = screen.getByLabelText(/username/i);
        fireEvent.change(usernameInput, {target: {value: 'alice'}});
        const submitBtn = screen.getByRole('button', {name: /^login$/i});
        fireEvent.click(submitBtn);
        await waitFor(() => {
            expect(screen.getByText('Password is required')).toBeInTheDocument();
        });
    });

    it('calls onLogin with credentials on successful submit', async () => {
        const onLogin = vi.fn().mockResolvedValue(undefined);
        render(<Login onLogin={onLogin} />);
        fireEvent.change(screen.getByLabelText(/username/i), {target: {value: 'alice'}});
        fireEvent.change(screen.getByLabelText('Password'), {target: {value: 'secret'}});
        fireEvent.click(screen.getByRole('button', {name: /^login$/i}));
        await waitFor(() => {
            expect(onLogin).toHaveBeenCalledWith({username: 'alice', password: 'secret'});
        });
    });

    it('renders with loading state', () => {
        const {container} = render(
            <Login
                onLogin={vi.fn()}
                loading
            />,
        );
        expect(container).toMatchSnapshot();
    });

    it('renders with register button', () => {
        const {container} = render(
            <Login
                onLogin={vi.fn()}
                registerPage="user.selfRegistration"
            />,
        );
        expect(screen.getByText('Register')).toBeInTheDocument();
        expect(container).toMatchSnapshot();
    });

    it('shows login error from onLogin rejection', async () => {
        const onLogin = vi.fn().mockRejectedValue(new Error('Invalid password'));
        render(<Login onLogin={onLogin} />);
        fireEvent.change(screen.getByLabelText(/username/i), {target: {value: 'alice'}});
        fireEvent.change(screen.getByLabelText('Password'), {target: {value: 'wrong'}});
        fireEvent.click(screen.getByRole('button', {name: /^login$/i}));
        await waitFor(() => {
            expect(screen.getByText('Invalid password')).toBeInTheDocument();
        });
    });
});

describe('Login — OTP step (initialStep="otp")', () => {
    it('renders OTP form when initialStep is otp', () => {
        render(
            <Login
                onLogin={vi.fn()}
                onOtp={vi.fn()}
                initialStep="otp"
            />,
        );
        expect(screen.getByText(/Enter the one-time password/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/one-time password/i)).toBeInTheDocument();
    });

    it('shows OTP required error when submitting empty OTP', async () => {
        render(
            <Login
                onLogin={vi.fn()}
                onOtp={vi.fn()}
                initialStep="otp"
            />,
        );
        const submitBtn = screen.getByText('Verify');
        fireEvent.click(submitBtn);
        await waitFor(() => {
            expect(screen.getByText('OTP is required')).toBeInTheDocument();
        });
    });

    it('calls onOtp with entered value on valid submit', async () => {
        const onOtp = vi.fn().mockResolvedValue(undefined);
        render(
            <Login
                onLogin={vi.fn()}
                onOtp={onOtp}
                initialStep="otp"
            />,
        );
        const input = screen.getByLabelText(/one-time password/i);
        fireEvent.change(input, {target: {value: '123456'}});
        fireEvent.click(screen.getByText('Verify'));
        await waitFor(() => expect(onOtp).toHaveBeenCalledWith('123456'));
    });

    it('shows error when onOtp throws', async () => {
        const onOtp = vi.fn().mockRejectedValue(new Error('Invalid OTP'));
        render(
            <Login
                onLogin={vi.fn()}
                onOtp={onOtp}
                initialStep="otp"
            />,
        );
        const input = screen.getByLabelText(/one-time password/i);
        fireEvent.change(input, {target: {value: '000000'}});
        fireEvent.click(screen.getByText('Verify'));
        await waitFor(() => {
            expect(screen.getByText('Invalid OTP')).toBeInTheDocument();
        });
    });
});

describe('Login — newPassword step (initialStep="newPassword")', () => {
    it('renders new password form when initialStep is newPassword', () => {
        render(
            <Login
                onLogin={vi.fn()}
                onNewPassword={vi.fn()}
                initialStep="newPassword"
            />,
        );
        expect(screen.getByText(/password has expired/i)).toBeInTheDocument();
    });

    it('shows passwords-do-not-match error when passwords differ', async () => {
        render(
            <Login
                onLogin={vi.fn()}
                onNewPassword={vi.fn()}
                initialStep="newPassword"
            />,
        );
        const newPassInput = screen.getByLabelText(/^New Password/i);
        const confirmInput = screen.getByLabelText(/Confirm Password/i);
        fireEvent.change(newPassInput, {target: {value: 'newpass1'}});
        fireEvent.change(confirmInput, {target: {value: 'different'}});
        const form = document.querySelector('.blong-login__form')!;
        fireEvent.submit(form);
        await waitFor(() => {
            expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
        });
    });

    it('calls onNewPassword with matching passwords', async () => {
        const onNewPassword = vi.fn().mockResolvedValue(undefined);
        render(
            <Login
                onLogin={vi.fn()}
                onNewPassword={onNewPassword}
                initialStep="newPassword"
            />,
        );
        const newPassInput = screen.getByLabelText(/^New Password/i);
        const confirmInput = screen.getByLabelText(/Confirm Password/i);
        fireEvent.change(newPassInput, {target: {value: 'SecurePass1!'}});
        fireEvent.change(confirmInput, {target: {value: 'SecurePass1!'}});
        const form = document.querySelector('.blong-login__form')!;
        fireEvent.submit(form);
        await waitFor(() =>
            expect(onNewPassword).toHaveBeenCalledWith({
                newPassword: 'SecurePass1!',
                confirmPassword: 'SecurePass1!',
            }),
        );
    });

    it('shows error when onNewPassword throws', async () => {
        const onNewPassword = vi.fn().mockRejectedValue(new Error('Weak password'));
        render(
            <Login
                onLogin={vi.fn()}
                onNewPassword={onNewPassword}
                initialStep="newPassword"
            />,
        );
        const newPassInput = screen.getByLabelText(/^New Password/i);
        const confirmInput = screen.getByLabelText(/Confirm Password/i);
        fireEvent.change(newPassInput, {target: {value: 'weakpass'}});
        fireEvent.change(confirmInput, {target: {value: 'weakpass'}});
        const form = document.querySelector('.blong-login__form')!;
        fireEvent.submit(form);
        await waitFor(() => {
            expect(screen.getByText('Weak password')).toBeInTheDocument();
        });
    });
});
