/* spell-checker: disable */
import {type IAssert, type IMeta, handler} from '@feasibleone/blong';
import {getWriter, type LogRecord} from '@feasibleone/lukaot/node';

/**
 * server/test/test/testViewerFlow.ts — a record reaches the reader (`@@D-946`).
 *
 * The realm has one contract and this is it: a process writes what it emits to
 * `log.destination`, and a reader asks the gateway for it. So the test does not
 * inject a row — it writes through `getWriter()`, which is the writer this
 * process installed from its own `log.destination` block, and reads the record
 * back through the methods the page calls. What it therefore covers is the whole
 * path: the sink, the UDP batch, the adapter's reassembly, the buffer, and the
 * gateway.
 *
 * What it proves, in order:
 *
 * 1. A record written by this process arrives, with the id a poll continues from.
 * 2. `after` is a cursor rather than a filter — the call answers nothing older
 *    than the id it was given.
 * 3. `viewer.entry.search` reads the whole buffer, and a search that matches
 *    nothing answers nothing.
 * 4. `viewer.entry.watch` starts at the buffer's position, wakes when a record
 *    arrives carrying only a cursor, and ends when the reader leaves (`@@D-948`).
 *
 * Registered as the `test.viewer.flow` group (`integration.watch.test` in
 * index.ts).
 */
/** One frame of `viewer.entry.watch`. */
interface IWatch {
    last?: string;
    size: number;
}

export default handler(
    ({lib: {group}, handler: {viewerEntryFind, viewerEntrySearch}}) => ({
        testViewerFlow: ({name = 'viewer flow'}: {name?: string} = {}) =>
            group(name)([
                // 1. A record written by this process reaches the buffer.
                async function writeRecord(assert: IAssert) {
                    const marker = `viewer-flow-${Date.now()}`;
                    emit(marker, 'a record the viewer should hold');
                    const answer = await waitFor(async () => {
                        const found = await viewerEntryFind<{entries: Array<{id: string}>}>(
                            {search: marker},
                            {} as IMeta,
                        );
                        return found.entries.length > 0 ? found : undefined;
                    });
                    assert.ok(answer, 'the record this process wrote reaches the buffer');
                    assert.ok(answer!.entries[0].id, 'it carries the id a poll continues from');
                    return {marker, id: answer!.entries[0].id};
                },

                // 2. `after` is a cursor: an old id answers only what came later.
                async function afterIsACursor(
                    assert: IAssert,
                    {$meta, writeRecord}: {$meta: IMeta; writeRecord: Promise<unknown>},
                ) {
                    const {id} = (await writeRecord) as {id: string};
                    const marker = `viewer-cursor-${Date.now()}`;
                    emit(marker, 'a record written after the cursor');
                    await waitFor(async () => {
                        const found = await viewerEntryFind<{entries: Array<{id: string}>}>(
                            {search: marker},
                            $meta,
                        );
                        return found.entries.length > 0 ? found : undefined;
                    });
                    const again = await viewerEntryFind<{entries: Array<{id: string}>}>(
                        {after: id},
                        $meta,
                    );
                    assert.ok(
                        !again.entries.some(entry => entry.id <= id),
                        'a cursor answers only what came after it',
                    );
                },

                // 3. The search reads the whole buffer, and narrows on its own words.
                async function searchNarrows(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const marker = `viewer-search-${Date.now()}`;
                    emit(marker, 'a record only a search should find');
                    const answer = await waitFor(async () => {
                        const found = await viewerEntrySearch<{entries: Array<{id: string}>}>(
                            {search: marker},
                            $meta,
                        );
                        return found.entries.length > 0 ? found : undefined;
                    });
                    assert.ok(answer, 'search finds the record it was written for');

                    const nothing = await viewerEntrySearch<{entries: unknown[]}>(
                        {search: `${marker}-nobody-wrote-this`},
                        $meta,
                    );
                    assert.equal(
                        nothing.entries.length,
                        0,
                        'a search that matches nothing answers nothing',
                    );
                },

                // 4. The wake starts at the position, wakes on a record, ends on abort.
                async function watchWakes(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    // Called through the group's own factory rather than the handler
                    // proxy: an async iterable is not a value the request/response
                    // machinery can carry (the proxy serialises what it answers), so
                    // the handler is exercised where the gateway reaches it — directly,
                    // with the store this process's adapter filled (`@@D-948`).
                    const {default: watchFactory} = await import(
                        '../../../adapter/log/viewerEntryWatch.ts'
                    );
                    const {storeOf} = await import('../../../adapter/log/store.ts');
                    const factory = watchFactory as unknown as (api: unknown) => unknown;
                    const wakeSource = factory({lib: {store: storeOf}}) as {
                        viewerEntryWatch: (
                            params: {after?: string},
                            $meta: IMeta,
                        ) => AsyncIterable<IWatch>;
                    };
                    const controller = new AbortController();
                    const iterator = wakeSource
                        .viewerEntryWatch({}, {...$meta, abort: controller.signal})
                        [Symbol.asyncIterator]();

                    const first = await within(iterator, 'the first frame');
                    assert.ok(
                        !first.done && first.value?.last !== undefined,
                        'the first frame says where the buffer stands',
                    );

                    const before = first.value!.last;
                    emit(`viewer-watch-${Date.now()}`, 'a record the woken reader is told about');
                    const woken = await within(iterator, 'a wake');
                    assert.ok(!woken.done, 'a record wakes the reader');
                    assert.ok(
                        woken.value!.last !== before,
                        'and the wake carries a cursor that moved',
                    );
                    assert.equal(
                        Object.keys(woken.value!).sort().join(','),
                        'last,size',
                        'a frame carries the cursor and the size, never a record',
                    );

                    controller.abort();
                    const ended = await within(iterator, 'the end of the stream');
                    assert.ok(ended.done, 'the wake ends when the reader leaves');

                    // A reader that says where it got to is told nothing it already knows. This is
                    // the half a reconnect depends on: the page keeps the last id it has and hands it
                    // to the stream it opens again, so the stream does not answer with a cursor the
                    // page already read — which cost one find per reconnect (`@@F-798`). The cursor
                    // is the one the reader was woken with, which is where its own find left it.
                    const again = new AbortController();
                    const resumed = wakeSource
                        .viewerEntryWatch({after: woken.value!.last}, {
                            ...$meta,
                            abort: again.signal,
                        })
                        [Symbol.asyncIterator]();
                    let told = false;
                    try {
                        await within(resumed, 'a frame a reader already has', 300);
                        told = true;
                    } catch {
                        told = false;
                    } finally {
                        again.abort();
                        await resumed.return?.(undefined);
                    }
                    assert.equal(
                        told,
                        false,
                        'a stream asked for from a cursor the buffer already holds stays quiet',
                    );
                },
            ]),
    }),
);

/**
 * Write one record the way a process does — through the sink `log.destination`
 * installed.
 *
 * The record, not the rendered line, is what crosses the wire (`@@D-930`), which
 * is why the marker sits in `fields` beside the message: the viewer's search reads
 * the record as it arrived, and a marker only in the line would prove nothing
 * about what the page can find.
 */
function emit(marker: string, message: string): void {
    getWriter()?.write(message, {
        level: 30,
        msg: message,
        fields: {marker},
    } as unknown as LogRecord);
}

/**
 * Ask until the answer says yes, or give up rather than hang the suite.
 *
 * The writer batches for a hundred milliseconds and the receiver holds a batch
 * for its own timeout, so the wait is real and bounded: fifty tries a hundred
 * milliseconds apart is the shape a test can rely on without a sleep that either
 * pads the suite or flakes under load.
 */
async function waitFor<T>(
    attempt: () => Promise<T | undefined>,
    tries = 50,
): Promise<T | undefined> {
    for (let index = 0; index < tries; index++) {
        const answer = await attempt();
        if (answer !== undefined) return answer;
        await new Promise<void>(resolve => setTimeout(resolve, 100));
    }
    return undefined;
}

/**
 * One frame of a stream, or a failure that names which wait hung.
 *
 * A wake resolves from a UDP delivery, so a bug that stopped waking would
 * otherwise stall the group until tap's own timeout reported it as an anonymous
 * hang.
 */
async function within<T>(
    iterator: AsyncIterator<T>,
    what: string,
    timeoutMs = 10_000,
): Promise<IteratorResult<T>> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`no ${what} within ${timeoutMs}ms`)), timeoutMs);
    });
    try {
        return await Promise.race([iterator.next(), timeout]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}
