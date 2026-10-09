import {handler, type IMeta} from '@feasibleone/blong';
import type {IDescribeCapable, IPlanConfig} from '../../plan.ts';
import {clusterNodeNames, planFor} from '../../plan.ts';
import {readSpecFile} from '../../spec.ts';

/**
 * kustomize.plan.find — the deployment plan for the loaded registry.
 *
 * The same derivation the `k8s` port runs at startup, exposed as a method so the
 * deployer, the operator and the UI can ask for the plan without re-implementing
 * it. `this.registry` is set by `AdapterBase` on every port instance.
 */
export default handler(({handler: {clusterNodeFind}}) => ({
    async kustomizePlanFind(params: {nodes?: string[]} | undefined, $meta: IMeta) {
        const self = this as unknown as {registry?: IDescribeCapable; config?: IPlanConfig};
        // The plan is the whole of what a tree is written from, so it carries the nodes a `nodeLocal`
        // volume is filled per — listed here rather than by whoever reads the plan next (D-470).
        const listed = (await clusterNodeFind({}, $meta)) as unknown as {items?: unknown[]};
        const nodes = params?.nodes ?? clusterNodeNames(listed);
        return planFor(self.config, self.registry, readSpecFile(self.config?.specFile), nodes);
    },
}));
