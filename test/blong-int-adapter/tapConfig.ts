/**
 * The time budget the integration harness runs under.
 *
 * A file here loads a process against real backends and then runs scenarios with deliberate waits —
 * a burst of silence, a rebalance, a group join — so tap's default budget is spent on the load
 * alone on a loaded machine, and the failure reads as a hang in whichever step happened to be
 * running (`@@F-851`). This module exists to be imported **before** `tap`: tap reads its
 * configuration once, when it is evaluated, so a value set anywhere later is never seen.
 */
process.env.TAP_TIMEOUT ??= '180';
