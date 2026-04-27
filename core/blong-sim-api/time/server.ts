import {realm} from '@feasibleone/blong';

/**
 * Time realm: demonstrates OpenAPI backend simulation.
 *
 * The realm has two sources of time data:
 * 1. clockGet: Pure local implementation that reads system clock (no external call).
 * 2. timeGet: Calls the world-time API via HTTP adapter (using OpenAPI codec).
 *
 * In integration mode, the sim layer activates a mock OpenAPI server that
 * responds to world-time API requests with locally computed data.
 * The HTTP adapter is configured to point to this local mock server.
 *
 * This demonstrates how to simulate OpenAPI-based backends without
 * requiring an internet connection or external services.
 */
export default realm(() => ({
    url: import.meta.url,
}));
