import type {ParsedArgs} from '@feasibleone/blong-gogo/cli.ts';

/**
 * The commands of `blong-int-kustomize`, and how a command line names one.
 *
 * The CLI is only the surface: each command is a handler in `runbook/`, and this file is the mapping
 * between a line somebody types and the method it dispatches — the same split the deployment realm's
 * own command file uses (the realm CLI pattern).
 */

export const USAGE = `blong-int-kustomize — the kustomize deployment's end-to-end runbook

Usage
  blong-int-kustomize <object> <predicate> [options]

Commands
  blong-int-kustomize machine prepare [--cluster=NAME] [--namespace=NS]
      Everything outside the cluster: the cluster itself, the suite's browser
      bundle, the framework image, the file server and both artifacts. Stops
      before the runbook.

  blong-int-kustomize suite deploy [--cluster=NAME] [--namespace=NS] [--tree=PATH]
      The runbook: generate both trees, install the operator, apply, wait, and
      assert what the cluster ended up with. Nothing is built or fetched — the
      image and the artifacts come from the environment (ARTIFACT_URL,
      OPERATOR_ARTIFACT_URL, FRAMEWORK_IMAGE, FRAMEWORK_VERSION) or a flag.

  blong-int-kustomize cycle run [options of both]
      The developer's cycle: prepare the machine, then deploy through it. The
      artifact URLs it published are left in the environment for the deploy.

Options
  --cluster=NAME          the k3d cluster (default dev-cluster is not assumed: the
                          runbook never creates one it did not find, F-446)
  --namespace=NS          the suite's namespace (default blong-suite)
  --service-off=NAME      a service the deployment runs itself (default: none)
  --agents=N              agent nodes, when the machine half creates the cluster
  --build-image=BOOL      build and import the framework image (default true)
  --build-suite=BOOL      build the suite's browser bundle (default true)
  --publish-artifacts=BOOL  deploy and publish both artifacts (default true)
  --refresh=BOOL          drop the caches and restart everything (default true)
  --output=json           print the result as JSON (the default when stdout is not a TTY)
  --help, -h              show this help and exit
`;

/** What one command dispatches: the method name and the params it passes through. */
export interface IRealmCommand {
    method: string;
    params?: object;
}

const text = (value: unknown): string | undefined =>
    value === undefined || value === null || value === '' ? undefined : String(value);

/**
 * A flag arrives as a string, and `--refresh=false` has to mean false: the pass reads only a literal
 * `true` as permission to go ahead, so a string passed through would be a silent yes — the same trap
 * the deployment realm's `reconcile` documents.
 */
const flag = (value: unknown): boolean | undefined =>
    value === undefined ? undefined : value === true || value === 'true';

const number = (value: unknown): number | undefined => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

/** The options every command shares, plus the ones only the machine half obeys. */
const shared = (argv: Record<string, unknown>): object => ({
    ...(text(argv.cluster) ? {cluster: text(argv.cluster)} : {}),
    ...(text(argv.namespace) ? {namespace: text(argv.namespace)} : {}),
    ...(text(argv['suite-entry']) ? {suiteEntry: text(argv['suite-entry'])} : {}),
    ...(text(argv.tree) ? {tree: text(argv.tree)} : {}),
    ...(text(argv['operator-tree']) ? {operatorTree: text(argv['operator-tree'])} : {}),
    ...(text(argv['service-off']) ? {serviceOff: text(argv['service-off'])} : {}),
    ...(text(argv['framework-image']) ? {frameworkImage: text(argv['framework-image'])} : {}),
    ...(text(argv['framework-version']) ? {frameworkVersion: text(argv['framework-version'])} : {}),
    ...(text(argv['operator-artifact-url'])
        ? {operatorArtifactUrl: text(argv['operator-artifact-url'])}
        : {}),
    ...(number(argv.agents) !== undefined ? {agents: number(argv.agents)} : {}),
    ...(text(argv['suite-package']) ? {suitePackage: text(argv['suite-package'])} : {}),
    ...(text(argv['local-image']) ? {localImage: text(argv['local-image'])} : {}),
    ...(text(argv['artifact-service']) ? {artifactService: text(argv['artifact-service'])} : {}),
    ...(text(argv['artifact-namespace'])
        ? {artifactNamespace: text(argv['artifact-namespace'])}
        : {}),
    ...(flag(argv['build-image']) !== undefined ? {buildImage: flag(argv['build-image'])} : {}),
    ...(flag(argv['build-suite']) !== undefined ? {buildSuite: flag(argv['build-suite'])} : {}),
    ...(flag(argv['publish-artifacts']) !== undefined
        ? {publishArtifacts: flag(argv['publish-artifacts'])}
        : {}),
    ...(flag(argv.refresh) !== undefined ? {refresh: flag(argv.refresh)} : {}),
});

/**
 * Name the method a command line asks for, or `undefined` for a line that asks for nothing — which
 * `runCli` answers with the usage text and a non-zero exit, so an unknown command is not a call.
 */
export const realmCommand = ({positionals, argv}: ParsedArgs): IRealmCommand | undefined => {
    const [object, predicate] = positionals;
    const params = shared(argv as Record<string, unknown>);
    if (object === 'machine' && predicate === 'prepare') {
        return {method: 'runbookMachinePrepare', params};
    }
    if (object === 'suite' && predicate === 'deploy') {
        return {method: 'runbookSuiteDeploy', params};
    }
    if (object === 'cycle' && predicate === 'run') {
        return {method: 'runbookCycleRun', params};
    }
    return undefined;
};
