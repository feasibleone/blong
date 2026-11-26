/**
 * The realm CLI's own vocabulary: how a command line names a command, and what each answers.
 *
 * Kept out of the entry point so a test can import one without arming the deadlock (@@F-394).
 *
 * Two kinds of verb live here. The **local** ones — `init`, `provision` and `secret` — write files and
 * shell out to `kubectl`, and must answer in an empty folder because a tenant installed this CLI with
 * `npx`; they never load the realm (`@@D-1022`). The rest name a handler method and are dispatched
 * through the live registry, which is what keeps this CLI and the JSON-RPC surface in agreement.
 */
import type {CliLocalCommand, ParsedArgs} from '@feasibleone/blong-gogo/cli.ts';

import {resolveHelp} from './help.ts';
import {detectSuite, flagsOf, init, provision, secret} from './provision.ts';

/** The text `--help` prints, resolved one level at a time from the registry beside this file. */
export const helpFor = (positionals: readonly string[]): string => resolveHelp(positionals);

/** What one command dispatches: the method name and the params it passes through. */
export interface IRealmCommand {
    method: string;
    params?: object;
}

/** The local commands, each answering from the arguments alone. */
const localCommand = (
    positionals: readonly string[],
    argv: Record<string, unknown>,
): CliLocalCommand | undefined => {
    const [command, verb] = positionals;
    const flags = flagsOf(argv);
    if (command === 'init') {
        return {method: 'init', local: async () => init(detectSuite(undefined, flags), flags)};
    }
    if (command === 'provision') {
        return {
            method: `provision ${verb ?? ''}`.trim(),
            local: async () => provision(verb, detectSuite(undefined, flags), flags),
        };
    }
    if (command === 'secret') {
        // The key lives beside the folder that holds the rc file, so every verb is told where the
        // tenant is — the same place `provision` reads it from.
        const context = detectSuite(undefined, flags);
        return {
            method: `secret ${verb ?? ''}`.trim(),
            local: async () => secret(verb, flags, context.root),
        };
    }
    return undefined;
};

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
export const realmCommand = ({
    positionals,
    argv,
}: ParsedArgs): IRealmCommand | CliLocalCommand | undefined => {
    const local = localCommand(positionals, argv);
    if (local) return local;
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
                ...(text(argv['artifact-digest'])
                    ? {artifactDigest: text(argv['artifact-digest'])}
                    : {}),
                ...(text(argv['framework-image'])
                    ? {frameworkImage: text(argv['framework-image'])}
                    : {}),
                ...(text(argv['framework-version'])
                    ? {frameworkVersion: text(argv['framework-version'])}
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
            method: 'kustomizeSecretsEnsure',
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
