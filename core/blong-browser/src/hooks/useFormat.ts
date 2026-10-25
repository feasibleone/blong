/**
 * `useFormatValue` — the formatter bound to the resolved configuration.
 *
 * The specification and the layers live in `lib/format.ts`; this hook is the one
 * place that reads them: the user's preference, then the system-wide configuration,
 * then the per-language default, with the UI language as the locale when nobody chose
 * one. It subscribes to all three, so a language switch or a settings change re-renders
 * the text instead of leaving yesterday's month names on screen. `@@D-616`
 */
import {useCallback, useMemo} from 'react';
import {type FormatFn, formatValue, resolveFormatConfig} from '../lib/format.js';
import {useAppStore} from '../state/appStore.js';

export function useFormatValue(): FormatFn {
    const language = useAppStore(state => state.language);
    const user = useAppStore(state => state.format.user);
    const system = useAppStore(state => state.format.system);
    const config = useMemo(
        () => resolveFormatConfig({user, system, language}),
        [user, system, language],
    );
    return useCallback(
        (value, type, options, useGrouping) =>
            formatValue(value, type, options, useGrouping, config),
        [config],
    );
}
