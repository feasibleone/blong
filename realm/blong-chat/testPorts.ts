/**
 * testPorts.ts — every port one run opens, in one place.
 *
 * The realm's listeners are fixed addresses because a platform, a tunnel and a signature agree on
 * them; the simulator answers on fixed addresses of its own. That means a developer's `blong` process
 * and a `blong-dev test` run want the same numbers, and only one of them can have them.
 *
 * `CHAT_TEST_PORT` resolves that: when it is set, the whole set moves in one step — the two listeners
 * and the two simulators — and the test accounts are pointed at the moved simulators, so the suite
 * runs beside a developer's process without either knowing about the other. Unset, everything is where
 * the README says it is.
 */
export interface ITestPorts {
    /** The Slack listener: where a platform posts and a tunnel forwards. */
    slack: number;
    /** The Viber listener. */
    viber: number;
    /** The Slack API simulator the test accounts post to. */
    slackSim: number;
    /** The Viber API simulator. */
    viberSim: number;
}

const shift = Number(process.env['CHAT_TEST_PORT']) || 0;

export const TEST_PORTS: ITestPorts = shift
    ? {slack: shift, viber: shift + 1, slackSim: shift + 10, viberSim: shift + 11}
    : {slack: 8095, viber: 8096, slackSim: 18085, viberSim: 18086};

/** Whether a run moved the ports, which is what tells the entry point to say so in its config. */
export const TEST_PORTS_SHIFTED = Boolean(shift);

/** The API base a test account posts to: its simulator, on the port this run uses. */
export const simBase = (platform: 'slack' | 'viber'): string =>
    platform === 'slack'
        ? `http://127.0.0.1:${TEST_PORTS.slackSim}/api/`
        : `http://127.0.0.1:${TEST_PORTS.viberSim}/pa/`;
