/**
 * Login — full-screen authentication form.
 *
 * The screen is divided into three vertically symmetric sections:
 *
 *  ┌──────────────────────────────────────────┐
 *  │                              [Register]  │  ← fixed top-right
 *  │  ┌── product area (1fr, end-aligned) ──┐ │  ← titleComponent + brand
 *  │  │  [titleComponent slot]              │ │
 *  │  │  [icon]  Product Title              │ │
 *  │  └─────────────────────────────────────┘ │
 *  │  ┌── card (auto) ──────────────────────┐ │  ← login form
 *  │  │  Login with password                │ │
 *  │  │  Username / Password / Login btn    │ │
 *  │  └─────────────────────────────────────┘ │
 *  │  ┌── org brand area (1fr, start) ──────┐ │  ← orgComponent / orgTitle
 *  │  │  [org icon]  Organisation Name      │ │
 *  │  └─────────────────────────────────────┘ │
 *  └──────────────────────────────────────────┘
 *
 * Product area (above) and org brand area (below) both receive `1fr` height,
 * keeping the card centred regardless of their content size.
 *
 * Registration mechanism:
 *   Pass `registerPage` (an action name) and the framework dispatches
 *   `portal.component.get` when the Register button is clicked.
 *   The resolved component replaces the login form.
 */
import './Login.css';

import {InputText, Message, Password} from '../../primereact/index.js';

import React, {useState} from 'react';
import {useBlongUi} from '../../context/BlongUiContext.js';
import {Button} from '../Button/Button.js';

type LoginStep = 'credentials' | 'otp' | 'newPassword';

interface ILoginCredentials {
    username: string;
    password: string;
}

export interface ILoginProps {
    onLogin: (credentials: ILoginCredentials) => Promise<void>;
    onOtp?: (otp: string) => Promise<void>;
    onNewPassword?: (passwords: {newPassword: string; confirmPassword: string}) => Promise<void>;
    /**
     * Application / brand name displayed next to the logo icon.
     * Also used as the document-level page title on the login screen.
     */
    title?: string;
    /** PrimeIcons class for the brand icon (e.g. 'pi pi-cog'). Default: 'pi pi-circle'. */
    logoIcon?: string;
    /** URL for a brand logo image (renders instead of logoIcon when set). */
    logoUrl?: string;
    /**
     * Pluggable React component rendered above the brand area,
     * e.g. for tenant banners, announcements, or extra branding.
     */
    titleComponent?: React.ComponentType;
    /**
     * Organisation brand area rendered below the login card.
     * Equal height to the product area above — keeps the card centred.
     *
     * Pass a fully custom component via `orgComponent`, or use the
     * built-in row layout via `orgTitle` + `orgIcon` / `orgLogoUrl`.
     */
    orgComponent?: React.ComponentType;
    /** Organisation name shown in the footer brand area. */
    orgTitle?: string;
    /** PrimeIcons class for the org icon (e.g. 'pi pi-building'). */
    orgIcon?: string;
    /** URL for the org logo image (renders instead of orgIcon when set). */
    orgLogoUrl?: string;
    /**
     * Action name dispatched as `portal.component.get` when the Register button is
     * clicked.  The resolved component is shown in place of the login form.
     *
     * When set, a "Register" button appears in the top-right corner.
     */
    registerPage?: string;
    /** Label for the Register button.  Default: 'Register'. */
    registerLabel?: string;
    /** External error to display above the form. */
    error?: string;
    loading?: boolean;
    /** Initial step — useful for Storybook previews and unit tests. */
    initialStep?: LoginStep;
}

export function Login({
    onLogin,
    onOtp,
    onNewPassword,
    title,
    logoIcon = 'pi pi-circle',
    logoUrl,
    titleComponent: TitleComponent,
    orgComponent: OrgComponent,
    orgTitle,
    orgIcon,
    orgLogoUrl,
    registerPage,
    registerLabel = 'Register',
    error: externalError,
    loading: externalLoading,
    initialStep = 'credentials',
}: ILoginProps) {
    const {dispatch} = useBlongUi();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [step, setStep] = useState<LoginStep>(initialStep);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [RegisterComp, setRegisterComp] = useState<React.ComponentType | null>(null);

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

    const handleRegister = async () => {
        if (!registerPage) return;
        try {
            const comp = await dispatch('portal.component.get', {page: registerPage});
            if (comp) setRegisterComp(() => comp as React.ComponentType);
        } catch {
            /* ignore — dispatch may show its own error */
        }
    };

    // ── Registration view ────────────────────────────────────────────────────
    if (RegisterComp) {
        return (
            <div className="blong-login p-component">
                <div className="blong-login__register-area">
                    <Button
                        label="Back to Login"
                        icon="pi pi-arrow-left"
                        className="p-button-text"
                        onClick={() => setRegisterComp(null)}
                    />
                </div>
                <div className="blong-login__register-view">
                    <RegisterComp />
                </div>
            </div>
        );
    }

    // ── Login view ────────────────────────────────────────────────────────────
    return (
        <div className="blong-login p-component">
            {registerPage && (
                <div className="blong-login__register-area">
                    <Button
                        label={registerLabel}
                        className="p-button-outlined"
                        onClick={() => void handleRegister()}
                    />
                </div>
            )}

            {/* Product area — 1fr row above the card */}
            <div className="blong-login__top">
                {TitleComponent && (
                    <div className="blong-login__title-slot">
                        <TitleComponent />
                    </div>
                )}
                {(title || logoUrl || logoIcon) && (
                    <div className="blong-login__brand">
                        {logoUrl ? (
                            <img
                                src={logoUrl}
                                alt={title ?? 'logo'}
                                className="blong-login__brand-img"
                            />
                        ) : (
                            <i className={`blong-login__brand-icon ${logoIcon}`} />
                        )}
                        {title && <span className="blong-login__brand-name">{title}</span>}
                    </div>
                )}
            </div>

            {/* Login card — auto-height middle row */}
            <div className="blong-login__card">
                <p className="blong-login__card-heading">Login with password</p>

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
                                className="blong-login__input w-full"
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
                                className="blong-login__input w-full"
                                inputClassName="w-full"
                                toggleMask
                                disabled={isLoading}
                            />
                        </div>
                        <Button
                            type="submit"
                            label="Login"
                            loading={isLoading}
                            className="blong-login__submit"
                        />
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

            {/* Org brand area — 1fr row below the card, same height as product area */}
            <div className="blong-login__bottom">
                {OrgComponent ? (
                    <OrgComponent />
                ) : orgTitle || orgLogoUrl || orgIcon ? (
                    <div className="blong-login__org-brand">
                        {orgLogoUrl ? (
                            <img
                                src={orgLogoUrl}
                                alt={orgTitle ?? 'logo'}
                                className="blong-login__org-img"
                            />
                        ) : orgIcon ? (
                            <i className={`blong-login__org-icon ${orgIcon}`} />
                        ) : null}
                        {orgTitle && <span className="blong-login__org-name">{orgTitle}</span>}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
