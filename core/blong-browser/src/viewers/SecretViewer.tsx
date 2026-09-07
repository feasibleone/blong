import React, {useState} from 'react';
import {Button} from '../primereact/index.js';
import type {ICommanderViewerProps} from './registry.js';
import {useViewerContent, viewerLabelStyle, viewerRowStyle, viewerValueStyle} from './util.js';

/**
 * SecretViewer — Vault secret leaf viewer.
 * Renders key/value pairs with values masked by default; "Reveal" shows them.
 * Read-only by design — editors are deferred to a later phase.
 */
export function SecretViewer({node, fetch, data, className}: ICommanderViewerProps) {
    const [revealed, setRevealed] = useState(false);
    const content = useViewerContent(node, fetch, data);
    const secret =
        content && typeof content === 'object' && !Array.isArray(content)
            ? (content as Record<string, unknown>)
            : {};

    return (
        <div
            className={`blong-viewer blong-viewer-secret ${className ?? ''}`}
            style={{padding: '0.75rem'}}
        >
            <div style={{marginBottom: '0.5rem'}}>
                <Button
                    label={revealed ? 'Hide values' : 'Reveal values'}
                    icon={revealed ? 'pi pi-eye-slash' : 'pi pi-eye'}
                    className="p-button-text p-button-sm"
                    onClick={() => setRevealed(value => !value)}
                />
            </div>
            {Object.entries(secret).map(([key, value]) => (
                <div key={key} style={viewerRowStyle}>
                    <span style={viewerLabelStyle}>{key}</span>
                    <span style={viewerValueStyle}>
                        {revealed ? String(value ?? '') : '••••••••'}
                    </span>
                </div>
            ))}
        </div>
    );
}
