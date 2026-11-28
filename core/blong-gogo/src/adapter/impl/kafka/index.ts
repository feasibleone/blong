/**
 * What the Kafka adapter is made of, in one place.
 *
 * The adapter file stays the wiring; these modules hold the mechanics and are re-exported so a
 * caller that only needs a piece — a test, another adapter's helper — does not reach into a file by
 * its internals (`@@T-782`).
 */
export * from './clients.ts';
export * from './names.ts';
export * from './config.ts';
export * from './produce.ts';
export * from './consume.ts';
export * from './topics.ts';
export * from './declarations.ts';
export * from './feed.ts';
