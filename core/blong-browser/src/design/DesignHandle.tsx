/**
 * DesignHandle — drag handle overlay shown in design mode corners.
 */
import React from 'react';
import {useDesignMode} from './useDesignMode.js';

interface IDesignHandleProps {
    dragListeners?: Record<string, unknown>;
    onSelect?: () => void;
    label?: string;
}

export function DesignHandle({dragListeners, onSelect, label}: IDesignHandleProps) {
    const {active} = useDesignMode();
    if (!active) return null;

    return (
        <div
            className="blong-design-handle"
            onClick={onSelect}
        >
            <span
                className="blong-design-handle__grip pi pi-bars"
                title={label ? `Drag ${label}` : 'Drag'}
                {...(dragListeners as React.HTMLAttributes<HTMLSpanElement>)}
            />
        </div>
    );
}
