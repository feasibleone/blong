import {handler, type IMeta} from '@feasibleone/blong';
import type {TreeLayout} from '../../generator.ts';
import {DEFAULT_OUTPUT_DIR, buildKustomizeTree, writeKustomizeTree} from '../../generator.ts';
import type {IDescribeCapable, IPlanConfig} from '../../plan.ts';
import {clusterNodeNames, planFor, planOptionsOf, resolveNodes} from '../../plan.ts';
import {readSpecFile} from '../../spec.ts';

/**
 * kustomize.tree.generate — derive the plan and write the kustomize tree: `outputDir`, `layout` and
 * `specFile` decide which half is written (@@D-395 @@D-475 @@D-488).
 */
/** The node a base-only generation is derived with: the base holds no node, so a stand-in is enough. */
const STAND_IN_NODE = 'fill-node';

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
        const layout = params?.layout ?? self.config?.layout ?? 'flat';
        // The nodes come from the cluster, and a caller that already knows them may say so instead:
        // the runbook has just listed them for the image import, and a test has no cluster to ask.
        // A base needs neither: it names no node, so a stand-in derives the fill template and never
        // reaches a file.
        const source = readSpecFile(specFile)?.nodeSource ?? planOptionsOf(self.config).nodeSource;
        const fromSource =
            params?.nodes || layout === 'base'
                ? undefined
                : await resolveNodes(source, async selector =>
                      clusterNodeNames(
                          (await clusterNodeFind({labelSelector: selector}, $meta)) as unknown as {
                              items?: unknown[];
                          },
                      ),
                  );
        const listed =
            params?.nodes || fromSource?.length || layout === 'base'
                ? undefined
                : ((await clusterNodeFind({}, $meta)) as unknown as {items?: unknown[]});
        const nodes =
            params?.nodes ?? fromSource ?? (listed ? clusterNodeNames(listed) : [STAND_IN_NODE]);
        const plan = planFor(self.config, self.registry, readSpecFile(specFile), nodes);
        const outputDir = params?.outputDir ?? self.config?.outputDir ?? DEFAULT_OUTPUT_DIR;
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
