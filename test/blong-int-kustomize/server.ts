import {realm} from '@feasibleone/blong';

/**
 * server.ts — the `runbook` realm: the kustomize deployment's end-to-end steps, as handlers.
 *
 * Each handler is one command of the CLI (`bin/blongIntKustomize.ts`) and one step a caller can reach
 * through the framework instead: prepare the machine, deploy a suite's tree, or do both in one pass.
 * What each one needs from the machine lives in `lib/`, in the handler shape — params in, `{run,
 * capture, log}` second, a result out — so the steps are the same functions whether a CLI, a tap group
 * or a release job drives them.
 *
 * The steps live in `orchestrator/` because that is a layer the loader discovers: a custom top-level
 * folder is not, so a realm that wants one has to make it a child realm of its own (the deployment
 * realm's own note on the same trap). The `cli` intent is recorded in no entry of the well-known
 * layer table, so a package that ships a command names the layers that command needs rather than
 * inheriting them.
 */
export default realm(() => ({
    url: import.meta.url,
    config: {
        // Nothing to configure: the steps take their coordinates as params, and the runbook's defaults
        // come from the environment the caller set (which is what lets one command serve CI).
        default: {},
    },
}));
