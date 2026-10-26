/**
 * LanguageDataRefresh — drops the cached data a language switch invalidates.
 *
 * A label is translated by the dictionary, which the store applies as soon as the
 * language changes. A record's name is not: it is translated by the query that
 * reads it, in the language the read asked for (`D-635`). After a switch every
 * cached row and every cached dropdown option still holds the previous language,
 * so both are dropped here and read again — a dropdown is never translated in
 * the browser, it is refetched.
 *
 * Mounted inside `BlongProvider`, which is where the query client lives. The first
 * render is skipped: the caches are empty, and the initial load is what fills them.
 */
import {useQueryClient} from '@tanstack/react-query';
import React from 'react';
import {dropdownRegistry} from '../../model/dropdownRegistry.js';
import {useAppStore} from '../../state/appStore.js';

export function LanguageDataRefresh() {
    const language = useAppStore(s => s.language);
    const queryClient = useQueryClient();
    const mountedRef = React.useRef(false);
    React.useEffect(() => {
        if (!mountedRef.current) {
            mountedRef.current = true;
            return;
        }
        dropdownRegistry.clear();
        void queryClient.invalidateQueries();
    }, [language, queryClient]);
    return null;
}
