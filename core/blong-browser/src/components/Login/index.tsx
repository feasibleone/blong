/**
 * Login — multi-step authentication form.
 */
import {Button} from 'primereact/button';
import {InputText} from 'primereact/inputtext';
import {Message} from 'primereact/message';
import {Password} from 'primereact/password';
import React, {useState} from 'react';

type LoginStep = 'credentials' | 'otp' | 'newPassword';

interface ILoginCredentials {
    username: string;
    password: string;
}

interface ILoginProps {
    onLogin: (credentials: ILoginCredentials) => Promise<void>;
    onOtp?: (otp: string) => Promise<void>;
    onNewPassword?: (passwords: {newPassword: string; confirmPassword: string}) => Promise<void>;
    register?: {label: string; href: string};
    title?: string;
    logoUrl?: string;
    error?: string;
    loading?: boolean;
    /** Initial step (for development preview and testing) */
    initialStep?: LoginStep;
}

export function Login({
    onLogin,
    onOtp,
    onNewPassword,
    register: registerLink,
    title = 'Sign In',
    logoUrl,
    error: externalError,
    loading: externalLoading,
    initialStep = 'credentials',
}: ILoginProps) {
    const [step, setStep] = useState<LoginStep>(initialStep);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const isLoading = externalLoading ?? loading;
    const displayError = externalError ?? error;

    const handleCredentials = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!username.trim()) {
            setError('Username is required');
            return;
        }
        if (!password.trim()) {
            setError('Password is required');
            return;
        }
        setLoading(true);
        try {
            await onLogin({username, password});
        } catch (err) {
            setError(String((err as Error).message ?? err));
        } finally {
            setLoading(false);
        }
    };

    const handleOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!otp.trim()) {
            setError('OTP is required');
            return;
        }
        setLoading(true);
        try {
            await onOtp?.(otp);
        } catch (err) {
            setError(String((err as Error).message ?? err));
        } finally {
            setLoading(false);
        }
    };

    const handleNewPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        setLoading(true);
        try {
            await onNewPassword?.({newPassword, confirmPassword});
        } catch (err) {
            setError(String((err as Error).message ?? err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="blong-login">
            <div className="blong-login__card">
                {logoUrl && (
                    <img
                        src={logoUrl}
                        alt="Logo"
                        className="blong-login__logo"
                    />
                )}
                <h2 className="blong-login__title">{title}</h2>

                {displayError && (
                    <Message
                        severity="error"
                        text={displayError}
                        className="blong-login__error"
                    />
                )}

                {step === 'credentials' && (
                    <form
                        className="blong-login__form"
                        onSubmit={e => void handleCredentials(e)}
                    >
                        <div className="blong-field">
                            <label
                                htmlFor="login-username"
                                className="blong-field__label"
                            >
                                Username
                            </label>
                            <InputText
                                id="login-username"
                                name="username"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                className="blong-login__input"
                                autoFocus
                                disabled={isLoading}
                            />
                        </div>
                        <div className="blong-field">
                            <label
                                htmlFor="login-password"
                                className="blong-field__label"
                            >
                                Password
                            </label>
                            <Password
                                inputId="login-password"
                                name="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="blong-login__input"
                                feedback={false}
                                toggleMask
                                disabled={isLoading}
                            />
                        </div>
                        <Button
                            type="submit"
                            label="Sign In"
                            icon="pi pi-sign-in"
                            loading={isLoading}
                            className="blong-login__submit"
                        />
                        {registerLink && (
                            <a
                                href={registerLink.href}
                                className="blong-login__register"
                            >
                                {registerLink.label}
                            </a>
                        )}
                    </form>
                )}

                {step === 'otp' && (
                    <form
                        className="blong-login__form"
                        onSubmit={e => void handleOtp(e)}
                    >
                        <p className="blong-login__hint">
                            Enter the one-time password sent to your device.
                        </p>
                        <div className="blong-field">
                            <label
                                htmlFor="login-otp"
                                className="blong-field__label"
                            >
                                One-Time Password
                            </label>
                            <InputText
                                id="login-otp"
                                value={otp}
                                onChange={e => setOtp(e.target.value)}
                                autoFocus
                                disabled={isLoading}
                            />
                        </div>
                        <Button
                            type="submit"
                            label="Verify"
                            loading={isLoading}
                            className="blong-login__submit"
                        />
                    </form>
                )}

                {step === 'newPassword' && (
                    <form
                        className="blong-login__form"
                        onSubmit={e => void handleNewPassword(e)}
                    >
                        <p className="blong-login__hint">
                            Your password has expired. Please set a new password.
                        </p>
                        <div className="blong-field">
                            <label
                                htmlFor="login-new-pass"
                                className="blong-field__label"
                            >
                                New Password
                            </label>
                            <Password
                                inputId="login-new-pass"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                toggleMask
                                disabled={isLoading}
                            />
                        </div>
                        <div className="blong-field">
                            <label
                                htmlFor="login-confirm-pass"
                                className="blong-field__label"
                            >
                                Confirm Password
                            </label>
                            <Password
                                inputId="login-confirm-pass"
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                toggleMask
                                feedback={false}
                                disabled={isLoading}
                            />
                        </div>
                        <Button
                            type="submit"
                            label="Set Password"
                            loading={isLoading}
                            className="blong-login__submit"
                        />
                    </form>
                )}
            </div>
        </div>
    );
}
