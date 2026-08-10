/**
 * SelfRegistration — full-screen self-service account creation form.
 *
 * Mirrors the Login component's full-screen layout (product area / card / org
 * brand area).  The component is prop-driven: it does not call the backend
 * itself — the app/suite wires `onRegister` (via the auth orchestrator) and
 * `onGoogle` (OAuth redirect).
 */
import './SelfRegistration.css';

import {InputText, Message, Password} from '../../primereact/index.js';

import React, {useState} from 'react';
import {Button} from '../Button/Button.js';
import {SocialLoginButton} from '../SocialLoginButton/SocialLoginButton.js';

export interface ISelfRegistrationCredentials {
    emailAddress: string;
    password: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    birthDate?: string;
    gender?: string;
    nationality?: string;
    occupation?: string;
}

export interface ISelfRegistrationProps {
    onRegister: (credentials: ISelfRegistrationCredentials) => Promise<void>;
    /** Starts the Google OAuth flow (window redirect). Optional. */
    onGoogle?: () => Promise<void> | void;
    /** Return to the login screen. Optional. */
    onBack?: () => void;
    title?: string;
    logoIcon?: string;
    logoUrl?: string;
    orgTitle?: string;
    orgIcon?: string;
    orgLogoUrl?: string;
    /** External error to display above the form. */
    error?: string;
    loading?: boolean;
    /** Label for the submit button. Default: 'Create account'. */
    submitLabel?: string;
}

export function SelfRegistration({
    onRegister,
    onGoogle,
    onBack,
    title,
    logoIcon = 'pi pi-user-plus',
    logoUrl,
    orgTitle,
    orgIcon = 'pi pi-building',
    orgLogoUrl,
    error: externalError,
    loading: externalLoading,
    submitLabel = 'Create account',
}: ISelfRegistrationProps) {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [emailAddress, setEmailAddress] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const isLoading = externalLoading ?? loading;
    const displayError = externalError ?? error;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!firstName.trim()) {
            setError('First name is required');
            return;
        }
        if (!lastName.trim()) {
            setError('Last name is required');
            return;
        }
        if (!emailAddress.trim()) {
            setError('Email address is required');
            return;
        }
        if (password.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        setLoading(true);
        try {
            await onRegister({
                emailAddress: emailAddress.trim(),
                password,
                firstName: firstName.trim(),
                lastName: lastName.trim(),
            });
        } catch (err) {
            setError(String((err as Error).message ?? err));
        } finally {
            setLoading(false);
        }
    };

    const handleGoogle = async () => {
        if (!onGoogle) return;
        try {
            await onGoogle();
        } catch {
            /* ignore — navigation may be blocked; parent shows its own error */
        }
    };

    return (
        <div className="blong-self-registration p-component">
            {/* Product area — 1fr row above the card */}
            <div className="blong-self-registration__top">
                {(title || logoUrl || logoIcon) && (
                    <div className="blong-self-registration__brand">
                        {logoUrl ? (
                            <img
                                src={logoUrl}
                                alt={title ?? 'logo'}
                                className="blong-self-registration__brand-img"
                            />
                        ) : (
                            <i className={`blong-self-registration__brand-icon ${logoIcon}`} />
                        )}
                        {title && (
                            <span className="blong-self-registration__brand-name">{title}</span>
                        )}
                    </div>
                )}
            </div>

            {/* Registration card — auto-height middle row */}
            <div className="blong-self-registration__card">
                <p className="blong-self-registration__card-heading">Create your account</p>

                {displayError && (
                    <Message
                        severity="error"
                        text={displayError}
                        className="blong-self-registration__error"
                    />
                )}

                <form
                    className="blong-self-registration__form"
                    onSubmit={e => void handleSubmit(e)}
                >
                    <div className="blong-self-registration__row">
                        <div className="blong-field">
                            <label
                                htmlFor="register-first-name"
                                className="blong-field__label"
                            >
                                First Name
                            </label>
                            <InputText
                                id="register-first-name"
                                name="firstName"
                                value={firstName}
                                onChange={e => setFirstName(e.target.value)}
                                className="w-full"
                                autoFocus
                                disabled={isLoading}
                            />
                        </div>
                        <div className="blong-field">
                            <label
                                htmlFor="register-last-name"
                                className="blong-field__label"
                            >
                                Last Name
                            </label>
                            <InputText
                                id="register-last-name"
                                name="lastName"
                                value={lastName}
                                onChange={e => setLastName(e.target.value)}
                                className="w-full"
                                disabled={isLoading}
                            />
                        </div>
                    </div>
                    <div className="blong-field">
                        <label htmlFor="register-email" className="blong-field__label">
                            Email Address
                        </label>
                        <InputText
                            id="register-email"
                            name="emailAddress"
                            type="email"
                            value={emailAddress}
                            onChange={e => setEmailAddress(e.target.value)}
                            className="w-full"
                            disabled={isLoading}
                        />
                    </div>
                    <div className="blong-self-registration__row">
                        <div className="blong-field">
                            <label htmlFor="register-password" className="blong-field__label">
                                Password
                            </label>
                            <Password
                                inputId="register-password"
                                name="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                toggleMask
                                disabled={isLoading}
                            />
                        </div>
                        <div className="blong-field">
                            <label htmlFor="register-confirm" className="blong-field__label">
                                Confirm Password
                            </label>
                            <Password
                                inputId="register-confirm"
                                name="confirmPassword"
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                toggleMask
                                disabled={isLoading}
                            />
                        </div>
                    </div>
                    <Button
                        type="submit"
                        label={submitLabel}
                        loading={isLoading}
                        className="blong-self-registration__submit"
                        data-testid="register-submit"
                    />
                </form>

                {onGoogle && (
                    <>
                        <div className="blong-self-registration__divider">
                            <span>or</span>
                        </div>
                        <SocialLoginButton
                            onClick={() => void handleGoogle()}
                            loading={isLoading}
                        />
                    </>
                )}

                {onBack && (
                    <div className="blong-self-registration__back">
                        <Button
                            label="Back to Login"
                            icon="pi pi-arrow-left"
                            className="p-button-text"
                            onClick={onBack}
                            disabled={isLoading}
                        />
                    </div>
                )}
            </div>

            {/* Org brand area — 1fr row below the card */}
            <div className="blong-self-registration__bottom">
                {(orgTitle || orgLogoUrl || orgIcon) && (
                    <div className="blong-self-registration__org-brand">
                        {orgLogoUrl ? (
                            <img
                                src={orgLogoUrl}
                                alt={orgTitle ?? 'logo'}
                                className="blong-self-registration__org-img"
                            />
                        ) : orgIcon ? (
                            <i className={`blong-self-registration__org-icon ${orgIcon}`} />
                        ) : null}
                        {orgTitle && (
                            <span className="blong-self-registration__org-name">{orgTitle}</span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
