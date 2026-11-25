/**
 * logViewerPage.tsx — the portal's log page (`@@D-946` `@@D-949`).
 *
 * The page is nearly nothing on purpose: the viewer is `@feasibleone/blong-log`'s
 * own component, and everything this file adds is what a portal has that the
 * standalone app does not — a transport, in two halves.
 *
 * `load` is the ordinary call it always was: the records, from the last id the
 * reader has. `subscribe` is `viewer.entry.watch` over a **streamed** route, and
 * all it says is "something arrived" — every wake is answered by one `load`, so a
 * frame never has to carry a record and a batched frame is not mistaken for one.
 *
 * The `data-*` attributes are the page's own diagnostics: whether the stream is
 * open and how many wakes it has delivered. A test asserts on them because that is
 * the only way to tell a subscription from a timer in a browser, and the alternative
 * would be a test that passes whether or not the stream works.
 */
import {useBlong, useThemePalette} from '@feasibleone/blong-browser';
import type {LogViewerSource} from '@feasibleone/blong-log/client';
import {LogViewer} from '@feasibleone/blong-log/client';
import type {LogEntry, ThemeConfig} from '@feasibleone/blong-log/types';
import React, {useMemo, useRef, useState} from 'react';

/** The handler proxy, typed for a two-argument call. */
type ICall = (params: object, meta: object) => Promise<unknown>;

export function LogViewerPage(): React.ReactElement {
    const {handler} = useBlong();
    const call = handler as unknown as Record<string, ICall | undefined>;
    // `open` is the stream as it *is*, and `end` says why it stopped being that: a page that only
    // ever sets `open: true` claims a subscription it may no longer have, and the fallback that
    // takes over is invisible — which is how a reconnect cycle read as a healthy stream (`@@F-798`).
    const [live, setLive] = useState<{open: boolean; wakes: number; end?: string}>({
        open: false,
        wakes: 0,
    });
    // Where this reader got to. Handed to the wake stream so a reconnect does not spend a find on a
    // cursor it already has: the handler yields its first frame only when the `after` it is given
    // differs from the buffer's last id (`@@F-798`).
    const cursorRef = useRef<string | undefined>(undefined);
    // The viewer draws its own grid and its own colours, so it cannot inherit the portal's theme: the
    // palette is the one thing it has to be told. Without it the page was the light grid inside a
    // dark portal — a page that reads as broken rather than as unstyled (`@@F-794`).
    const palette = useThemePalette();
    const theme = useMemo<ThemeConfig | undefined>(
        () => (palette === 'dark' || palette === 'light' ? {mode: palette} : undefined),
        [palette],
    );

    const source = useMemo<LogViewerSource>(
        () => ({
            // A subscription that ends falls back to asking this often; while it is
            // open the timer is not used at all.
            intervalMs: 5000,
            load: async ({after, limit}) => {
                const answer = (await call['viewer.entry.find']?.(
                    {
                        ...(after === undefined ? {} : {after}),
                        ...(limit === undefined ? {} : {limit}),
                    },
                    {},
                )) as {entries?: LogEntry[]; last?: string} | undefined;
                if (answer?.last) cursorRef.current = answer.last;
                return {entries: answer?.entries ?? []};
            },
            subscribe: async ({signal}) => {
                // The machine envelope: this reader is a program, and the route seals
                // its frames. `after` is where this reader already is, so a stream that
                // is opened again says nothing it has already said. `details: false` is
                // this page's own choice: it reads the records through
                // `viewer.entry.find`, so a frame that carried them would be a second
                // read of the same bytes, and a log line is not worth a frame.
                const frames = (await call['viewer.entry.watch']?.(
                    {
                        ...(cursorRef.current ? {after: cursorRef.current} : {}),
                        details: false,
                    },
                    {stream: 'binary'},
                )) as AsyncIterable<unknown> | undefined;
                if (!frames) return undefined;
                setLive(state => ({...state, open: true, end: undefined}));
                return (async function* () {
                    try {
                        for await (const wake of frames) {
                            if (signal.aborted) return;
                            setLive(state => ({...state, wakes: state.wakes + 1}));
                            yield wake;
                        }
                        setLive(state => ({...state, open: false, end: 'ended'}));
                    } catch (error) {
                        setLive(state => ({
                            ...state,
                            open: false,
                            end: String((error as Error)?.message ?? error).slice(0, 160),
                        }));
                        throw error;
                    }
                })();
            },
        }),
        [call],
    );

    return (
        <div
            data-stream={live.open ? 'open' : 'closed'}
            data-wakes={live.wakes}
            data-stream-end={live.end}
        >
            <LogViewer
                source={source}
                theme={theme}
            />
        </div>
    );
}
