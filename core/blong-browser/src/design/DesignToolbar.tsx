/**
 * DesignToolbar — toolbar section injected into Editor when design mode is active.
 */
import {Button} from '../components/Button/Button.js';
import {useDesignMode} from './useDesignMode.js';

interface IDesignToolbarProps {
    isDesignMode: boolean;
    onToggle: () => void;
}

export function DesignToolbar({isDesignMode, onToggle}: IDesignToolbarProps) {
    const {canUndo, canRedo, undo, redo, saveConfig, saving} = useDesignMode();

    return (
        <div className="blong-design-toolbar">
            <Button
                icon={isDesignMode ? 'pi pi-check' : 'pi pi-cog'}
                label={isDesignMode ? 'Done' : 'Configure'}
                className="p-button-sm p-button-outlined"
                onClick={onToggle}
                tooltip="Toggle design mode"
            />
            {isDesignMode && (
                <>
                    <Button
                        icon="pi pi-undo"
                        className="p-button-sm p-button-text"
                        onClick={undo}
                        disabled={!canUndo}
                        tooltip="Undo"
                    />
                    <Button
                        icon="pi pi-refresh"
                        className="p-button-sm p-button-text"
                        onClick={redo}
                        disabled={!canRedo}
                        tooltip="Redo"
                    />
                    <Button
                        icon="pi pi-save"
                        label="Save layout"
                        className="p-button-sm p-button-success"
                        onClick={() => void saveConfig()}
                        loading={saving}
                        tooltip="Save layout configuration"
                    />
                </>
            )}
        </div>
    );
}
