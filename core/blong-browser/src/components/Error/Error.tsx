/**
 * Error — global error dialog.
 */
import {Dialog} from '../../primereact/index.js';

import {useBlongUi} from '../../context/BlongUiContext.js';
import {useAppStore} from '../../state/appStore.js';
import {Button} from '../Button/Button.js';

/**
 * Error types that indicate an expired or invalid session.
 */
const AUTH_ERROR_TYPES = new Set([
    'identity.unauthenticated',
    'identity.invalidCredentials',
    'identity.sessionExpired',
]);

function isAuthError(type?: string) {
    return !!type && AUTH_ERROR_TYPES.has(type);
}

export function ErrorDialog() {
    const error = useAppStore(s => s.error);
    const clearError = useAppStore(s => s.clearError);
    const {loginRoute} = useBlongUi();

    if (!error) return null;

    const unauthorized = isAuthError(error.type);

    const handleLogin = () => {
        clearError();
        if (loginRoute) window.location.href = loginRoute;
    };

    return (
        <Dialog
            visible
            header={
                <span className="blong-error-dialog__title">
                    <i className="pi pi-exclamation-circle blong-error-dialog__icon" /> Error
                </span>
            }
            onHide={unauthorized ? () => {} : clearError}
            closable={!unauthorized}
            className="blong-error-dialog"
            style={{width: '480px'}}
            modal
        >
            <div className="blong-error-dialog__body">
                <p className="blong-error-dialog__message">{error.print ?? error.message}</p>
                {error.validation && error.validation.length > 0 && (
                    <ul className="blong-error-dialog__validation">
                        {error.validation.map(v => (
                            <li key={v.field}>
                                <strong>{v.field}:</strong> {v.message}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <div className="blong-error-dialog__footer">
                {unauthorized ? (
                    <Button
                        label="Login"
                        icon="pi pi-sign-in"
                        onClick={handleLogin}
                    />
                ) : (
                    <Button
                        label="Close"
                        icon="pi pi-times"
                        onClick={clearError}
                    />
                )}
            </div>
        </Dialog>
    );
}
