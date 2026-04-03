/**
 * SelectionIndicator — highlighted border overlay for the selected element.
 */
import {useDesignMode} from './useDesignMode.js';

interface ISelectionIndicatorProps {
    id: string;
    label?: string;
}

export function SelectionIndicator({id, label}: ISelectionIndicatorProps) {
    const {active, selected} = useDesignMode();
    if (!active || selected?.id !== id) return null;

    return (
        <div
            className="blong-selection-indicator"
            aria-hidden
        >
            {label && <span className="blong-selection-indicator__badge">{label}</span>}
        </div>
    );
}
