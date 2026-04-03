/**
 * Error — global error dialog.
 */
import {Button} from 'primereact/button';
import {Dialog} from 'primereact/dialog';
import {useAppStore} from '../../state/appStore.js';

export function ErrorDialog() {
    const error = useAppStore(s => s.error);
    const clearError = useAppStore(s => s.clearError);

    if (!error) return null;

    return (
        <Dialog
            visible
            header={
                <span className="blong-error-dialog__title">
                    <i className="pi pi-exclamation-circle blong-error-dialog__icon" /> Error
                </span>
            }
            onHide={clearError}
            className="blong-error-dialog"
            style={{width: '480px'}}
            modal
        >
            <div className="blong-error-dialog__body">
                <p className="blong-error-dialog__message">{error.print ?? error.message}</p>
                {error.validation && error.validation.length > 0 && (
                    <ul className="blong-error-dialog__validation">
                        {error.validation.map((v, i) => (
                            <li key={i}>
                                <strong>{v.field}:</strong> {v.message}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <div className="blong-error-dialog__footer">
                <Button
                    label="Close"
                    icon="pi pi-times"
                    onClick={clearError}
                />
            </div>
        </Dialog>
    );
}
