/**
 * useCommanderNav — keyboard handling for the commander explorer.
 *
 * Provides global shortcuts (F5 refresh, F2 open, Enter, Escape, `?` help,
 * Ctrl/Cmd+F search) and an active-pane focus model (tree | table | viewer)
 * so the commander can be driven entirely from the keyboard.
 *
 * Plain arrow keys are left to the focused widget (PrimeReact Tree/DataTable
 * already handle expand/collapse and cell navigation); the pane ring is
 * traversed with Tab / Shift+Tab via `movePane`.
 */
import {useCallback, useEffect, useRef, useState} from 'react';

export type CommanderPane = 'tree' | 'table' | 'viewer';

export interface ICommanderKeyHandlers {
    /** Enter pressed on the active pane. */
    onEnter?: () => void;
    /** Escape pressed (clear search / close help). */
    onEscape?: () => void;
    /** Backspace pressed (go up to parent / close the viewer). */
    onBackspace?: () => void;
    /** F5 pressed (refresh current branch). */
    onRefresh?: () => void;
    /** F2 pressed (open leaf). */
    onOpen?: () => void;
    /** Ctrl/Cmd+F pressed (focus search). */
    onSearch?: () => void;
    /** `?` pressed (toggle help overlay). */
    onHelp?: () => void;
}

const PANES: CommanderPane[] = ['tree', 'table', 'viewer'];

export function useCommanderNav(handlers: ICommanderKeyHandlers) {
    const [activePane, setActivePane] = useState<CommanderPane>('tree');
    const ref = useRef(handlers);
    ref.current = handlers;

    const movePane = useCallback((dir: 1 | -1) => {
        setActivePane(prev => {
            const idx = PANES.indexOf(prev);
            return PANES[(idx + dir + PANES.length) % PANES.length];
        });
    }, []);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const h = ref.current;
            const target = e.target as HTMLElement | null;
            // Don't hijack keys while typing in an input/textarea/select.
            const tag = target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
                return;
            }
            if (e.ctrlKey || e.metaKey) {
                if (e.key.toLowerCase() === 'f') {
                    e.preventDefault();
                    h.onSearch?.();
                }
                return;
            }
            switch (e.key) {
                case 'Enter':
                    h.onEnter?.();
                    break;
                case 'Escape':
                    h.onEscape?.();
                    break;
                case 'Backspace':
                    e.preventDefault();
                    h.onBackspace?.();
                    break;
                case 'F5':
                    e.preventDefault();
                    h.onRefresh?.();
                    break;
                case 'F2':
                    h.onOpen?.();
                    break;
                case '?':
                    h.onHelp?.();
                    break;
                default:
                    break;
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    return {activePane, setActivePane, movePane};
}
