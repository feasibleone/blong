#!/usr/bin/env -S node
/**
 * runbook/runbookOperatorDeploy.ts — install or update the operator, and nothing else.
 *
 * The suite deploy installs the operator because a tenant's objects are useless without one; an
 * *operator* change needs the other direction — the install alone, without regenerating a suite's tree,
 * applying a tenant's declaration, or waiting on pods that did not change. That is what this is: the
 * same `operatorInstall` the suite run calls, reachable on its own (@@D-653).
 *
 * It talks to the cluster only. Where the operator's image and artifact come from is the caller's
 * answer, which is what makes one command serve both halves of the loop: a developer's cycle publishes
 * a local image and a local `kustomize.zip` first and then runs this, and a released install names the
 * published image and the artifact URL its release published.
 *
 * What it does *not* do is forget the cache: the operator's artifact cache is keyed by the artifact's
 * identity (its digest), so a republished artifact lands in a new directory and the fill Job the tree
 * carries fetches it. The rollout this waits on is what makes the new code the code that runs — a pod
 * keeps executing the code it started with (@@D-653).
 */
import {handler} from '@feasibleone/blong';

import {clusterEnsure, nodeNames} from '../../lib/cluster.ts';
import {handlerIo} from '../../lib/exec.ts';
import {
    operatorInstall,
    runbookOptions,
    type IRunbookOptions,
    type IRunbookReport,
} from './runbookSuiteDeploy.ts';

/**
 * runbook.operator.deploy — regenerate the install tree and make the cluster run it.
 *
 * `createCluster` is honoured the same way the suite run honours it: a run pointed at a cluster that is
 * not there stops and says so unless the caller explicitly asked for one (F-446).
 */
export default handler(() => ({
    async runbookOperatorDeploy(params: Partial<IRunbookOptions> = {}): Promise<IRunbookReport> {
        const io = handlerIo(this);
        const options: IRunbookOptions = {
            ...runbookOptions(),
            ...Object.fromEntries(
                Object.entries(params).filter(([, value]) => value !== undefined),
            ),
        };
        io.say(`cluster ${options.cluster}`);
        await clusterEnsure(
            {
                cluster: options.cluster,
                agents: options.agents,
                create: options.createCluster,
            },
            io,
        );
        await nodeNames(io);
        await operatorInstall(options, io);
        io.log(
            `the operator runs ${options.frameworkImage}:${options.frameworkVersion}` +
                (options.operatorArtifactUrl ? ` from ${options.operatorArtifactUrl}` : ''),
        );
        return {
            cluster: options.cluster,
            namespace: 'blong-system',
            tree: options.operatorTree,
            done: true,
        };
    },
}));
