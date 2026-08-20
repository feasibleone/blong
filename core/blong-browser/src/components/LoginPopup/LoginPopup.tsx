/**
 * LoginPopup — modal re-authentication prompt.
 *
 * Shown when an operation fails with an expired/invalid session (401) and the
 * client-side token renewal could not refresh it (e.g. the session was closed
 * server-side).  The user logs in here and then re-invokes the failed
 * operation — there is deliberately NO automatic retry of the original call.
 *
 * Wired through the store's `loginPrompt` flag, which `wrapHandlerProxy`
 * raises on auth-classified errors.
 */
import './LoginPopup.css';

import {Dialog, InputText, Message, Password} from '../../primereact/index.js';

import {useState} from 'react';
import {useBlong} from '../../context/BlongContext.js';
import {useAppStore} from '../../state/appStore.js';
import {Button} from '../Button/Button.js';

export function LoginPopup() {
    const prompt = useAppStore(s => s.loginPrompt);
    const setLoginPrompt = useAppStore(s => s.setLoginPrompt);
    const {handler} = useBlong();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | undefined>(undefined);
    const [loading, setLoading] = useState(false);

    if (!prompt) return null;

    const close = () => {
        setLoginPrompt(false);
        setError(undefined);
        setPassword('');
    };

    const onSubmit = async () => {
        setLoading(true);
        setError(undefined);
        try {
            const result = (await handler.authLogin(
                {username, password},
                {},
            )) as {step?: string; error?: string};
            if (result.step === 'success') {
                close();
            } else {
                setError(result.error ?? 'Login failed');
            }
        } catch (err) {
            setError((err as {message?: string}).message ?? 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog
            visible
            header="Session expired — please log in"
            onHide={close}
            closable
            modal
            className="blong-login-popup"
            style={{width: '380px'}}
        >
            <div className="blong-login-popup__body">
                {error && (
                    <Message
                        severity="error"
                        text={error}
                        className="blong-login-popup__error"
                    />
                )}
                <div className="blong-login-popup__field">
                    <label htmlFor="blong-login-popup-username">Username</label>
                    <InputText
                        id="blong-login-popup-username"
                        name="username"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && onSubmit()}
                        autoFocus
                    />
                </div>
                <div className="blong-login-popup__field">
                    <label htmlFor="blong-login-popup-password">Password</label>
                    <Password
                        id="blong-login-popup-password"
                        name="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && onSubmit()}
                        feedback={false}
                        toggleMask
                    />
                </div>
            </div>
            <div className="blong-login-popup__footer">
                <Button label="Cancel" icon="pi pi-times" onClick={close} outlined />
                <Button label="Login" icon="pi pi-sign-in" onClick={onSubmit} loading={loading} />
            </div>
        </Dialog>
    );
}
