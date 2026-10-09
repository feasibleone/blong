/**
 * The realm CLI's own vocabulary: its usage text, and how a command line names a method.
 *
 * It lives beside the entry point rather than inside it, and that is not a matter of taste. The
 * framework's `isCliEntry` guard exists so a `bin/*.ts` can be imported by a test without running a
 * command — but a test under a *layer folder* is a module the loader imports on every load, `cli`
 * included (recording handler folders is what `Registry.describe()` reads). So a test importing the
 * entry point puts the entry's own `await runCli(...)` on the load path it is waiting for: the entry
 * is mid-evaluation, the loader awaits this module, and this module's import of the entry awaits the
 * entry. Node reports that as an unsettled top-level await and exits 13 with no output at all, which
 * is a deadlock wearing a hang's clothes (F-394).
 *
 * Keeping everything worth testing here means the entry point has no inbound import, and a test can
 * drive the commands without arming that trap.
 */
import type {ParsedArgs} from '@feasibleone/blong-gogo/cli.ts';

export const USAGE = `blong-kustomize — the deployment realm's own commands

Usage
  blong-kustomize release-notify --suite=NAME --version=VERSION
      [--artifact-url=URL] [--framework-image=IMAGE] [--namespace=NS]
      Tell a cluster what a release published: patches the BlongDeployment named
      after the suite. The gitops seam is asked first and wins when a target is
      configured, so a cluster with one operator is never told twice.

  blong-kustomize volume-prune [--retention=N]
      Report which retained suite versions are past the retention (default 3).
      A report, not a deletion: only the operator may delete.

  blong-kustomize keys-ensure --namespace=NS
      Create the suite's gateway keys if the cluster has none, and report which
      happened. A key that exists is left alone: sessions outlive a deployment.

  blong-kustomize reconcile [--from=registry|cr] [--apply] [--prune]
      [--name=CR] [--namespace=NS] [--cache-dir=PATH]
      Run one pass of the operator's loop and print what it found: the difference
      between the tree and the cluster, and every step that failed. Without
      --apply it only reports, and without --prune it deletes nothing.

Options
  --output=json   Print the result as JSON (the default when stdout is not a TTY).
  --help, -h      Show this help and exit.
`;

/** What one command dispatches: the method name and the params it passes through. */
export interface IRealmCommand {
    method: string;
    params?: object;
}

const text = (value: unknown): string | undefined =>
    value === undefined || value === null || value === '' ? undefined : String(value);

const number = (value: unknown): number | undefined => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : undefined;
};

/**
 * Name the method a command line asks for, or `undefined` for a line that asks for nothing — which
 * `runCli` answers with the usage text and a non-zero exit, so an unknown command is not a call.
 */
export const realmCommand = ({positionals, argv}: ParsedArgs): IRealmCommand | undefined => {
    const command = positionals[0];
    if (command === 'release-notify') {
        return {
            method: 'kustomizeReleaseNotify',
            params: {
                // Drops what was not given rather than passing empty strings: the handler treats an
                // absent artifact URL as "the release did not publish one" and an empty one as a
                // value, and only the first is true.
                ...(text(argv.suite) ? {suite: text(argv.suite)} : {}),
                ...(text(argv.version) ? {version: text(argv.version)} : {}),
                ...(text(argv['artifact-url']) ? {artifactUrl: text(argv['artifact-url'])} : {}),
                ...(text(argv['framework-image'])
                    ? {frameworkImage: text(argv['framework-image'])}
                    : {}),
                ...(text(argv.namespace) ? {namespace: text(argv.namespace)} : {}),
            },
        };
    }
    if (command === 'volume-prune') {
        return {
            method: 'kustomizeVolumePrune',
            params: {...(number(argv.retention) ? {retention: number(argv.retention)} : {})},
        };
    }
    if (command === 'keys-ensure') {
        return {
            method: 'kustomizeGatewayKeysEnsure',
            params: {...(text(argv.namespace) ? {namespace: text(argv.namespace)} : {})},
        };
    }
    if (command === 'reconcile') {
        // A flag arrives as a string, and `--apply=false` has to mean false: the pass treats only a
        // literal `true` as permission to write, so passing the string through would be a silent
        // yes to the one question this command exists to ask carefully.
        const flag = (value: unknown): boolean | undefined =>
            value === undefined ? undefined : value === true || value === 'true';
        const origin = text(argv.from);
        return {
            method: 'kustomizeReconcileRun',
            params: {
                ...(origin === 'cr' || origin === 'registry' ? {from: origin} : {}),
                ...(flag(argv.apply) !== undefined ? {apply: flag(argv.apply)} : {}),
                ...(flag(argv.prune) !== undefined ? {prune: flag(argv.prune)} : {}),
                ...(text(argv.name) ? {name: text(argv.name)} : {}),
                ...(text(argv.namespace) ? {namespace: text(argv.namespace)} : {}),
                ...(text(argv['cache-dir']) ? {cacheDir: text(argv['cache-dir'])} : {}),
            },
        };
    }
    return undefined;
};
