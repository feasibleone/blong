import {realm} from '@feasibleone/blong';

/**
 * server.ts — blong-commander realm entry point (server platform).
 *
 * The `orchestrator/commander` group provides the generic commander protocol:
 * `commander.source.list`, `commander.branch.list`, `commander.node.get`,
 * `commander.node.viewer`, `commander.node.action`. The source descriptors are
 * exported by the group's `config.ts` (see `config/sources.ts`).
 */
export default realm(() => ({url: import.meta.url}));
