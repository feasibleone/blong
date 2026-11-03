/**
 * Warm the page system while the shell is idle.
 *
 * The portal's first paint needs the shell and nothing else — the login form, the
 * menubar and the empty portal are all drawn by components the shell imports itself.
 * Everything a *page* renders sits behind a registration that the portal awaits, so it
 * is only fetched when someone opens that page: the editor, the widget registry, the
 * report, the test-run console, the viewers and the model system, several megabytes of
 * them in a dev server (`@@D-747`).
 *
 * Waiting for that click is the wrong default. The modules are needed by everyone who
 * logs in, they are known up front, and there is a quiet moment right after the login
 * form appears — while the reader types a password, or while the gateway answers the
 * login. So they are fetched then, on an idle callback, and the first page opens from
 * the module cache instead of waiting for its own code.
 *
 * Three properties this keeps, deliberately:
 *
 * 1. **It never blocks a paint.** `requestIdleCallback` runs after the frame the shell
 *    was drawn in, and a `setTimeout` fallback covers a browser without it.
 * 2. **A failure is silent.** A prefetch that throws is a page that loads when it is
 *    opened, which is the behaviour without this module; it must not surface as an
 *    error a shell reports.
 * 3. **It is observable.** When the warm-up finishes the document carries
 *    `data-blong-prefetch="done"`, so a test that wants to *wait* for the page system
 *    (rather than race it) has something honest to wait on.
 *
 * It is a warm-up, not a dependency: nothing awaits it, and a page opened before it
 * finishes simply imports what it needs itself. @@D-747
 */
let started = false;

/**
 * Fetch the library's page code in the background.
 *
 * The package root is the list: everything the library can render is exported there,
 * and a hand-written list of modules would fall behind the day a page kind is added.
 * This is one of the few places a root import is right — a dev server does not
 * tree-shake, which is the whole point here.
 */
export function prefetchPageSystem(): void {
    if (started || !globalThis.document) return;
    started = true;
    const load = () => {
        import('./index.js').then(
            () => {
                document.documentElement.dataset['blongPrefetch'] = 'done';
            },
            () => {
                // A page opened later imports what it needs; nothing is lost.
                document.documentElement.dataset['blongPrefetch'] = 'failed';
            },
        );
    };
    const idle = (
        globalThis as {
            requestIdleCallback?: (callback: () => void, options?: {timeout: number}) => void;
        }
    ).requestIdleCallback;
    if (idle) idle(load, {timeout: 3_000});
    else setTimeout(load, 200);
}
