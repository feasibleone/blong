/**
 * LoginForm — authentication form using PrimeReact components.
 *
 * A simple username/password form that calls `login()` from the
 * AuthProvider context.
 */

import React, {useState} from 'react';
import {useForm} from 'react-hook-form';

import {useAuth} from './AuthProvider.js';

interface LoginFormData {
    username: string;
    password: string;
}

/** Props for the LoginForm component. */
export interface LoginFormProps {
    /** Title displayed above the form (default: 'Sign In'). */
    title?: string;
    /** Custom class name for the form container. */
    className?: string;
    /** Callback after successful login. */
    onSuccess?: () => void;
}

/**
 * Login form component using react-hook-form.
 *
 * @example
 * ```tsx
 * <LoginForm title="Welcome" onSuccess={() => navigate('/')} />
 * ```
 */
export function LoginForm({
    title = 'Sign In',
    className = '',
    onSuccess,
}: LoginFormProps): React.ReactElement {
    const {login, isLoading, error} = useAuth();
    const [submitError, setSubmitError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: {errors},
    } = useForm<LoginFormData>();

    const onSubmit = async (data: LoginFormData): Promise<void> => {
        setSubmitError(null);
        try {
            await login(data.username, data.password);
            onSuccess?.();
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : 'Login failed');
        }
    };

    const displayError = submitError ?? error;

    return (
        <div className={`blong-login-form ${className}`}>
            <h2>{title}</h2>
            <form onSubmit={handleSubmit(onSubmit)}>
                <div className="blong-field">
                    <label htmlFor="username">Username</label>
                    <input
                        id="username"
                        type="text"
                        autoComplete="username"
                        disabled={isLoading}
                        {...register('username', {required: 'Username is required'})}
                    />
                    {errors.username && (
                        <small className="blong-field-error">{errors.username.message}</small>
                    )}
                </div>
                <div className="blong-field">
                    <label htmlFor="password">Password</label>
                    <input
                        id="password"
                        type="password"
                        autoComplete="current-password"
                        disabled={isLoading}
                        {...register('password', {required: 'Password is required'})}
                    />
                    {errors.password && (
                        <small className="blong-field-error">{errors.password.message}</small>
                    )}
                </div>
                {displayError && (
                    <div className="blong-login-error">{displayError}</div>
                )}
                <button
                    type="submit"
                    disabled={isLoading}
                    className="blong-login-button"
                >
                    {isLoading ? 'Signing in...' : 'Sign In'}
                </button>
            </form>
        </div>
    );
}
