/**
 * Race `promise` against a timeout, rejecting if it does not settle in time.
 *
 * The timeout handle is cleared as soon as `promise` settles. Without the
 * `finally` clear the timer stays ref'd for the full timeout after the
 * operation completes, which keeps the Node event loop (and thus the test
 * process) alive long after `platform.stop()` — that delay tripped the CI
 * test timeout in `blong-int-sql` (the 3 deadlock helpers each left a 20s
 * timer behind).
 */
export const withDeadlockTimeout = <T>(promise: Promise<T>, ms = 20_000): Promise<T> => {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`deadlock test timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => {
        if (timer) clearTimeout(timer);
    });
};
