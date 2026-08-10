/**
 * OAuthCallback — full-screen "Signing you in with Google…" screen.
 *
 * Reads `code`/`state` from the URL query string (the Google redirect target),
 * calls `onExchange` to swap the code for a token, then navigates to `/` on
 * success.  On failure it shows the error and a "Back to Login" button.
 */
import './OAuthCallback.css';

import {ProgressSpinner} from '../../primereact/index.js';

import React, {useEffect, useState} from 'react';
import {Button} from '../Button/Button.js';

export interface IOAuthCallbackProps {
    /** Swaps the authorization code for a session token (auth orchestrator). */
    onExchange: (params: {code: string; state?: string; redirectUri?: string}) => Promise<void>;
    /** Invoked after a successful exchange so the App can drop this screen. */
    onSuccess?: () => void;
    title?: string;
    logoIcon?: string;
}

export function OAuthCallback({onExchange, onSuccess, title, logoIcon = 'pi pi-google'}: IOAuthCallbackProps) {
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            const search = new URLSearchParams(window.location.search);
            const code = search.get('code') ?? '';
            const state = search.get('state') ?? undefined;
            // The redirect_uri must match the current URL (which may live under
            // a base path such as `/s/`).
            const redirectUri = `${window.location.origin}${window.location.pathname}`;
            if (!code) {
                if (!cancelled) {
                    setError('No authorization code was returned');
                    setLoading(false);
                }
                return;
            }
            try {
                await onExchange({code, state, redirectUri});
                if (!cancelled) {
                    // The exchange already stored the session token in the app
                    // store. Strip the callback suffix from the URL (the app
                    // may live under a base path such as `/s/`), then let the
                    // App re-render and show the portal.
                    const suffix = '/oauth/callback';
                    const base = window.location.pathname.endsWith(suffix)
                        ? window.location.pathname.slice(0, -suffix.length) || '/'
                        : window.location.pathname;
                    window.history.replaceState({}, '', base);
                    onSuccess?.();
                }
            } catch (err) {
                if (!cancelled) {
                    setError(String((err as Error).message ?? err));
                    setLoading(false);
                }
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [onExchange, onSuccess]);

    const backToLogin = () => {
        window.location.href = '/';
    };

    return (
        <div className="blong-oauth-callback p-component">
            <div className="blong-oauth-callback__card">
                <i className={`blong-oauth-callback__icon ${logoIcon}`} />
                {loading ? (
                    <>
                        <p className="blong-oauth-callback__heading">
                            Signing you in with Google…
                        </p>
                        <ProgressSpinner
                            className="blong-oauth-callback__spinner"
                            style={{width: '3rem', height: '3rem'}}
                        />
                    </>
                ) : (
                    <>
                        <p className="blong-oauth-callback__heading">Sign in failed</p>
                        <p className="blong-oauth-callback__error">{error}</p>
                        <Button
                            label="Back to Login"
                            icon="pi pi-arrow-left"
                            className="p-button-outlined blong-oauth-callback__back"
                            onClick={backToLogin}
                            data-testid="oauth-back-login"
                        />
                    </>
                )}
                {title && <p className="blong-oauth-callback__brand">{title}</p>}
            </div>
        </div>
    );
}
