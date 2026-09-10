import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

/**
 * Tests for time operations.
 *
 * testTimeClock: Tests the pure local clock implementation (no external calls).
 * testTimeGet: Tests the world-time API integration through the sim.
 *   Verifies the complete flow:
 *   1. Test calls clockTimeGet (orchestrator handler)
 *   2. Orchestrator calls time.get via the HTTP adapter
 *   3. HTTP adapter calls the local mock server (sim layer at port 8082)
 *   4. Mock server responds using mocktimeGet handler
 *   5. Response is returned and verified
 */
export default handler(({lib: {group}, handler: {clockGet, clockTimeGet}}) => ({
    testTimeClock: ({name = 'local clock'}: {name: string}) =>
        group(name)([
            async function clockResult(assert: typeof Assert, {$meta}) {
                const result = await clockGet<{
                    datetime: string;
                    utc_datetime: string;
                    unixtime: number;
                }>({}, $meta);
                assert.ok(result.datetime, 'Return datetime');
                assert.ok(result.utc_datetime, 'Return utc_datetime');
                assert.ok(typeof result.unixtime === 'number', 'Return unixtime');
                return result;
            },
        ]),

    testTimeGet: ({name = 'world time api via sim'}: {name: string}) =>
        group(name)([
            async function timeResult(assert: typeof Assert, {$meta}) {
                const result = await clockTimeGet<{
                    datetime: string;
                    timezone: string;
                }>({area: 'Europe', location: 'Sofia'}, $meta);
                assert.ok(result.datetime, 'Return datetime');
                assert.ok(result.timezone, 'Return timezone');
                assert.strictEqual(
                    result.timezone,
                    'Europe/Sofia',
                    'Timezone matches requested area/location',
                );
                return result;
            },
        ]),
}));
