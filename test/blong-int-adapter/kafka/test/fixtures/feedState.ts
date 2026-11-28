/**
 * What the feed's handler did, for a test to read back.
 *
 * A module outside every layer folder on purpose: both the handler that writes it and the handler
 * that answers it read one object, and nothing loads this file as a handler of its own.
 */
export interface IFeedState {
    processed: number;
    failed: number;
    offsets: number[];
    /** How many records the handler is inside right now — what a concurrency shows up as. */
    inFlight: number;
    /** The most records it has ever been inside at once, which is the concurrency it achieved. */
    peakInFlight: number;
    /** The offsets a record asked to fail once and then be accepted, so a retry is observable. */
    failedOnce: number[];
    /** The last error a record threw, so a test can say what the feed met. */
    lastError?: string;
}

export const feedState: IFeedState = {
    processed: 0,
    failed: 0,
    offsets: [],
    inFlight: 0,
    peakInFlight: 0,
    failedOnce: [],
};

export const feedReset = (): void => {
    feedState.processed = 0;
    feedState.failed = 0;
    feedState.offsets = [];
    feedState.inFlight = 0;
    feedState.peakInFlight = 0;
    feedState.failedOnce = [];
    feedState.lastError = undefined;
};
