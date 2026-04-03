/**
 * useDesignMode — consumes design mode context.
 * Returns {active: false, ...} when not in a DesignModeProvider.
 */
import {useContext} from 'react';
import {DesignModeContext, type IDesignModeContextValue} from './DesignModeContext.js';

const inertResult: IDesignModeContextValue = {
    active: false,
    selected: null,
    select: () => undefined,
    config: {cards: {}, layouts: {}},
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

export function useDesignMode(): IDesignModeContextValue {
    // @ts-expect-error — accessing context directly to avoid throwing
    const ctx = useContext(DesignModeContext as React.Context<IDesignModeContextValue | null>);
    return ctx ?? inertResult;
}
