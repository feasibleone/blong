/**
 * FeedbackToggle.tsx — the switch in the menubar (`@@T-467`).
 *
 * Renders only when `portal.feedback.enabled` is true (`@@D-662`): the switch adds
 * a node to the menubar, and every visual baseline of a suite that never turned
 * the feature on would otherwise be invalidated by it.
 *
 * The button stops `pointerdown` from reaching the document. That single line is
 * what makes "switching to the mode closes nothing" true at the moment of
 * switching: PrimeReact closes an open overlay on a document-level pointer event,
 * and the activation happens on the click that follows.
 */

import {useCallback, useEffect} from 'react';

import {usePermission} from '../hooks/usePermission.js';
import {useTranslate} from '../hooks/useText.js';
import {useAppStore} from '../state/appStore.js';
import './feedback.css';
import {FEEDBACK_UI_ATTR} from './ids.js';
import {useFeedbackConfig} from './useFeedbackConfig.js';

interface IShortcut {
    alt: boolean;
    ctrl: boolean;
    shift: boolean;
    key: string;
}

/** Parse `F2` / `ctrl+shift+F` / `Alt+f` into the parts a keydown carries. */
export function parseShortcut(shortcut: string): IShortcut {
    const parts = shortcut.split('+').map(part => part.trim().toLowerCase());
    const key = parts.pop() ?? 'f';
    return {
        alt: parts.includes('alt'),
        ctrl: parts.includes('ctrl') || parts.includes('control'),
        shift: parts.includes('shift'),
        key,
    };
}

/** Does this event match the shortcut? */
export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
    const parsed = parseShortcut(shortcut);
    return (
        event.altKey === parsed.alt &&
        event.ctrlKey === parsed.ctrl &&
        event.shiftKey === parsed.shift &&
        event.key.toLowerCase() === parsed.key
    );
}

export function FeedbackToggle() {
    const config = useFeedbackConfig();
    const active = useAppStore(state => state.feedback.active);
    const items = useAppStore(state => state.feedback.items);
    const reset = useAppStore(state => state.feedbackReset);
    const allowed = usePermission(config?.permission ?? 'feedback.session.add');
    const t = useTranslate();
    const count = Object.keys(items).length;

    const toggle = useCallback(() => {
        const state = useAppStore.getState();
        if (state.feedback.active) {
            if (
                Object.keys(state.feedback.items).length &&
                !window.confirm(
                    t('Discard the comments and leave feedback mode?') ??
                        'Discard the comments and leave feedback mode?',
                )
            ) {
                return;
            }
            reset();
        }
        state.feedbackActivate(!state.feedback.active);
    }, [reset, t]);

    useEffect(() => {
        if (!config?.enabled) return;
        const shortcut = config.shortcut ?? 'F2';
        // A function key needs no modifier, so it does not collide with the browser's
        // own Alt combinations (`@@T-491`).
        const onKeyDown = (event: KeyboardEvent) => {
            if (!matchesShortcut(event, shortcut)) return;
            // The mode's own guard swallows keys while it is active, so this
            // listener only ever fires on the way in — and on the way out it is
            // the toggle the guard would have blocked, hence the capture phase.
            event.preventDefault();
            event.stopPropagation();
            const state = useAppStore.getState();
            state.feedbackActivate(!state.feedback.active);
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
    }, [config?.enabled, config?.shortcut]);

    if (!config?.enabled || !allowed) return null;

    return (
        <button
            type="button"
            className={`blong-feedback-toggle${active ? ' blong-feedback-toggle--active' : ''}`}
            title={t('Feedback mode') ?? 'Feedback mode'}
            aria-pressed={active}
            onPointerDown={event => event.stopPropagation()}
            onClick={event => {
                event.stopPropagation();
                toggle();
            }}
            {...{[FEEDBACK_UI_ATTR]: 'toggle'}}
        >
            <i className="pi pi-comment" />
            {count > 0 && <span className="blong-feedback-toggle__count">{count}</span>}
        </button>
    );
}
