/**
 * Loader — full-page loading overlay.
 */
import './index.css';
import {ProgressSpinner} from '../../primereact/index.js';

import {useLoader} from '../../hooks/useLoader.js';

export function Loader() {
    const {loading, message} = useLoader();
    if (!loading) return null;

    return (
        <div
            className="blong-loader-overlay"
            role="status"
            aria-live="polite"
        >
            <div className="blong-loader-content">
                <ProgressSpinner
                    style={{width: '50px', height: '50px'}}
                    strokeWidth="4"
                    animationDuration=".8s"
                />
                {message && <p className="blong-loader-message">{message}</p>}
            </div>
        </div>
    );
}
