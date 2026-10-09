import {layer} from '@feasibleone/blong';

/**
 * runbook/layer.server.ts — the steps that talk to a machine and a cluster.
 *
 * Loaded wherever the package is: a `cli` run is what drives it (the CLI's commands *are* these
 * handlers), a tap run reaches the assertions beside them, and a release job can call the same step
 * from a process it starts itself.
 *
 * Declared explicitly because the folder is not one of the well-known layers, and a custom name is only
 * discovered when it says so.
 */
export default layer({
    default: true,
});
