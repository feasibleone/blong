import {handler, type IMeta} from '@feasibleone/blong';
import type {TreeLayout} from '../../generator.ts';
import {DEFAULT_OUTPUT_DIR, buildKustomizeTree, writeKustomizeTree} from '../../generator.ts';
import type {IDescribeCapable, IPlanConfig} from '../../plan.ts';
import {clusterNodeNames, planFor} from '../../plan.ts';
import {readSpecFile} from '../../spec.ts';

/**
 * kustomize.tree.generate — derive the plan and write the kustomize tree.
 *
 * `outputDir` defaults to the realm config's `outputDir`, then to
 * `system/kustomize` under the current working directory (the suite root when
 * the `k8s` intent runs there). The directory is replaced, not merged, so a
 * regenerated tree never keeps a stale file.
 *
 * `specFile` is the CR the operator is generating for, if there is one: it is read here rather than
 * in the planner so the planner stays free of the filesystem, and it wins only where it names a
 * field (T-234).
 *
 * `layout` is `flat` unless the caller asks for `split`: the operator reads a tree back and compares its
 * objects with the cluster, which a base with patches cannot answer, while a repository tree is applied
 * with kustomize and is worth keeping node-free and artifact-free (D-475).
 */
export default handler(({handler: {clusterNodeFind}}) => ({
    async kustomizeTreeGenerate(
        params:
            | {
                  outputDir?: string;
                  specFile?: string;
                  nodes?: string[];
                  layout?: TreeLayout;
              }
            | undefined,
        $meta: IMeta,
    ) {
        const self = this as unknown as {registry?: IDescribeCapable; config?: IPlanConfig};
        const specFile = params?.specFile ?? self.config?.specFile;
        // The nodes come from the cluster, and a caller that already knows them may say so instead:
        // the runbook has just listed them for the image import, and a test has no cluster to ask.
        const listed = (await clusterNodeFind({}, $meta)) as unknown as {items?: unknown[]};
        const nodes = params?.nodes ?? clusterNodeNames(listed);
        const plan = planFor(self.config, self.registry, readSpecFile(specFile), nodes);
        const outputDir = params?.outputDir ?? self.config?.outputDir ?? DEFAULT_OUTPUT_DIR;
        const layout = params?.layout ?? self.config?.layout ?? 'flat';
        // What a caller needs to *report* the tree as well as to read it: the counts are the plan's, and
        // the plan is not something the answer can hand over (a tree is files, and a plan is a shape).
        return {
            outputDir,
            layout,
            files: writeKustomizeTree(buildKustomizeTree(plan), outputDir, {layout, plan}),
            suite: {
                name: plan.suite.name,
                namespace: plan.suite.namespace,
                install: plan.install,
            },
            deployments: plan.deployments.length,
            services: plan.services.length,
            profile: plan.profile,
            volume: plan.suiteVolume.backend,
        };
    },
}));
