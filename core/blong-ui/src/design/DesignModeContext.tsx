/**
 * DesignModeContext — propagates design mode state through the component tree.
 * When active=false, all design concerns are zero-cost no-ops.
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { LayoutConfig } from '../hooks/useLayout.js';
import type { ICardConfig, IEnrichedFieldSchema } from '../types/widget.js';

export type DesignElementType = 'card' | 'field' | 'deck' | 'widget';

export interface IDesignElement {
    id: string;
    type: DesignElementType;
    label?: string;
}

export interface ILayoutEditorConfig {
    cards: Record<string, ICardConfig>;
    layouts: Record<string, LayoutConfig>;
    /** Per-field schema overrides (title, widget.type, readOnly, required, etc.) */
    schema?: Record<string, Partial<IEnrichedFieldSchema>>;
}

export interface IHistoryEntry {
    config: ILayoutEditorConfig;
    description: string;
}

export interface IDesignModeContextValue {
    active: boolean;
    selected: IDesignElement | null;
    select: (element: IDesignElement | null) => void;
    config: ILayoutEditorConfig;
    updateConfig: (patch: Partial<ILayoutEditorConfig>) => void;
    permission: string;
    /** Undo / redo */
    canUndo: boolean;
    canRedo: boolean;
    undo: () => void;
    redo: () => void;
    pushHistory: (description: string) => void;
    /** Saving */
    saving: boolean;
    saveConfig: () => Promise<void>;
}

export const DesignModeContext = createContext<IDesignModeContextValue | null>(null);

export function useDesignModeContext(): IDesignModeContextValue {
    const ctx = useContext(DesignModeContext);
    if (!ctx)
        throw new Error('[blong-ui] useDesignModeContext must be used inside DesignModeProvider');
    return ctx;
}

/** Inert context returned when design mode is inactive (avoids conditional hook calls) */
const inertContext: IDesignModeContextValue = {
    active: false,
    selected: null,
    select: () => undefined,
    config: {cards: {}, layouts: {}, schema: {}},
    updateConfig: () => undefined,
    permission: 'portal.design',
    canUndo: false,
    canRedo: false,
    undo: () => undefined,
    redo: () => undefined,
    pushHistory: () => undefined,
    saving: false,
    saveConfig: async () => undefined,
};

export interface IDesignModeProviderProps {
    active: boolean;
    permission?: string;
    initialConfig: ILayoutEditorConfig;
    onSave?: (config: ILayoutEditorConfig) => Promise<void>;
    children: ReactNode;
}

export function DesignModeProvider({
    active,
    permission = 'portal.design',
    initialConfig,
    onSave,
    children,
}: IDesignModeProviderProps) {
    const [selected, setSelected] = useState<IDesignElement | null>(null);
    const [config, setConfig] = useState<ILayoutEditorConfig>(initialConfig);
    const [history, setHistory] = useState<IHistoryEntry[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [saving, setSaving] = useState(false);

    const updateConfig = useCallback((patch: Partial<ILayoutEditorConfig>) => {
        setConfig(prev => ({...prev, ...patch}));
    }, []);

    const pushHistory = useCallback(
        (description: string) => {
            setHistory(prev => {
                const newHistory = prev.slice(0, historyIndex + 1);
                return [...newHistory, {config, description}];
            });
            setHistoryIndex(prev => prev + 1);
        },
        [config, historyIndex],
    );

    const undo = useCallback(() => {
        if (historyIndex >= 0) {
            setConfig(history[historyIndex].config);
            setHistoryIndex(prev => prev - 1);
        }
    }, [history, historyIndex]);

    const redo = useCallback(() => {
        if (historyIndex < history.length - 1) {
            const next = history[historyIndex + 1];
            setConfig(next.config);
            setHistoryIndex(prev => prev + 1);
        }
    }, [history, historyIndex]);

    const saveConfig = useCallback(async () => {
        if (!onSave) return;
        setSaving(true);
        try {
            await onSave(config);
        } finally {
            setSaving(false);
        }
    }, [onSave, config]);

    if (!active) {
        return (
            <DesignModeContext.Provider value={inertContext}>{children}</DesignModeContext.Provider>
        );
    }

    const value: IDesignModeContextValue = {
        active,
        selected,
        select: setSelected,
        config,
        updateConfig,
        permission,
        canUndo: historyIndex >= 0,
        canRedo: historyIndex < history.length - 1,
        undo,
        redo,
        pushHistory,
        saving,
        saveConfig,
    };

    return <DesignModeContext.Provider value={value}>{children}</DesignModeContext.Provider>;
}
