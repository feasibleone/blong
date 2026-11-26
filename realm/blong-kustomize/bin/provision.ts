/**
 * provision.ts — the commands that answer without the realm.
 *
 * `init`, `provision` and `secret` write files and shell out to `kubectl`; none of them reads a
 * registry, and all of them have to work from an empty folder, because the tenant that runs them
 * installed this CLI with `npx` and has no checkout @@D-1022. They are `local` commands for that
 * reason — see `CliLocalCommand` in the framework's `cli.ts`.
 *
 * What is provisioned here is only what a reconcile pass cannot: the namespace a declaration lives in,
 * the rights the pass runs under (a pass refuses to write its own grant, @@D-1020), the master key its
 * configuration decrypts with, and — once, at a cut-over — the data the first converge must find. The
 * suite's ServiceAccount, its Jobs, its processes and its Ingresses are the operator's, and a tenant
 * that created them by hand would have a deployment nothing reconciles @@D-1021.
 */
import {spawnSync} from 'node:child_process';
import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {parseDocument} from 'yaml';

import {
    masterKeyFrom,
    masterKeyGenerate,
    openYaml,
    sealedPaths,
    sealMarked,
    sealYaml,
    secretRandom,
    secretSeal,
} from '@feasibleone/blong-lib/secret';
import {AUTH_REVIEW_ROLE, SUITE_SERVICE_ACCOUNT} from '../generator.ts';
import {
    AUTH_REVIEW_RULES,
    OPERATOR_GROUP,
    OPERATOR_NAME,
    OPERATOR_NAMESPACE,
    OPERATOR_NAMESPACED_RULES,
} from '../operator.ts';
import {MASTER_KEY_ENV, MASTER_KEY_SECRET} from '../plan.ts';
import {DEFAULT_SERVICES_NAMESPACE} from '../services.ts';

/**
 * Where a tenant keeps what it provisions: ignored whole, and written by `init` (@@D-1025).
 *
 * The operator's grants used to live in the suite's generated tree, in `…/kustomize/base/grants/`,
 * where every pass skipped them with a message — the one object a pass may not write was kept beside
 * the ones it must (@@D-1027).
 */
const PROVISION_DIR = join('system', 'provision');

/** The tenant's own copy of the master key, beside its rc file: 0600, and ignored with the folder. */
export const MASTER_KEY_FILE = '.master_key';

export interface ISuiteContext {
    /** The folder the commands work from. */
    root: string;
    /** The suite, realm or folder name — the default for `--suite`. */
    name: string;
    /** The namespace the declaration lives in. */
    namespace: string;
    /** `system/kustomize/base`, when the folder holds a tree. */
    tree?: string;
    /** `system/provision`, when the folder holds the tenant's manifests. */
    provision?: string;
    /** Whether a package was found, rather than an empty folder. */
    package: boolean;
}

const readJson = (file: string): Record<string, unknown> | undefined => {
    try {
        return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    } catch {
        return undefined;
    }
};

/**
 * Walk up from a folder for the package that owns it, and read what it says about its deployment.
 *
 * An empty folder is not an error: a tenant with `npx` has nothing but a working directory, so the
 * answer is a generic context named after the folder. What the walk looks for is a `package.json`,
 * because that is what names a package — a folder with no package is nobody's suite, whatever else it
 * holds.
 */
export const detectSuite = (
    from: string = process.cwd(),
    flags: {suite?: string; namespace?: string} = {},
): ISuiteContext => {
    let folder = resolve(from);
    for (;;) {
        const pkg = readJson(join(folder, 'package.json'));
        if (pkg) {
            const packageName = String(pkg.name ?? '');
            const name = flags.suite ?? (packageName.replace(/^@[^/]+\//, '') || 'blong');
            const provision = join(folder, PROVISION_DIR);
            const tree = join(folder, 'system', 'kustomize', 'base');
            const namespaceFile = join(provision, 'namespace.yaml');
            // The namespace is read from the manifest that creates it rather than guessed from the
            // name: a package name and a namespace disagree often enough that guessing rewrites the
            // wrong one.
            const declared = existsSync(namespaceFile)
                ? /^\s{2}name:\s*(\S+)\s*$/m.exec(readFileSync(namespaceFile, 'utf8'))?.[1]
                : undefined;
            return {
                root: folder,
                name,
                namespace: flags.namespace ?? declared ?? name,
                ...(existsSync(tree) ? {tree} : {}),
                ...(existsSync(provision) ? {provision} : {}),
                package: true,
            };
        }
        const parent = dirname(folder);
        if (parent === folder) break;
        folder = parent;
    }
    const name = flags.suite ?? resolve(from).split('/').pop() ?? 'blong';
    // The folder may be nobody's package and still hold what a previous `init` wrote: a tenant that
    // installed the CLI with npx provisions from the directory it stands in, and `provision` has to
    // find the same manifests `init` put there.
    const root = resolve(from);
    const provision = join(root, PROVISION_DIR);
    const tree = join(root, 'system', 'kustomize', 'base');
    const declared = existsSync(join(provision, 'kustomization.yaml'))
        ? /^namespace:\s*(\S+)\s*$/m.exec(
              readFileSync(join(provision, 'kustomization.yaml'), 'utf8'),
          )?.[1]
        : undefined;
    return {
        root,
        name,
        namespace: flags.namespace ?? declared ?? name,
        ...(existsSync(tree) ? {tree} : {}),
        ...(existsSync(provision) ? {provision} : {}),
        package: false,
    };
};

/** A `kubectl` call: printed before it runs, so a failing step is reproducible by hand. */
const kubectl = (
    args: readonly string[],
    options: {input?: string; dryRun?: boolean} = {},
): number => {
    process.stderr.write(`+ kubectl ${args.join(' ')}\n`);
    if (options.dryRun) return 0;
    const result = spawnSync('kubectl', [...args], {
        input: options.input,
        stdio: [options.input === undefined ? 'inherit' : 'pipe', 'inherit', 'inherit'],
    });
    if (result.error) throw new Error(`kubectl: ${result.error.message}`);
    return result.status ?? 1;
};

const say = (message: string): void => {
    process.stderr.write(`${message}\n`);
};

/** Whether the cluster knows the secret, without printing it. */
const secretExists = (namespace: string, name: string): boolean =>
    spawnSync('kubectl', ['-n', namespace, 'get', 'secret', name], {
        stdio: ['ignore', 'ignore', 'ignore'],
    }).status === 0;

/**
 * Write the tenant's master key into its namespace, from the environment, once.
 *
 * The value never reaches a command line: the Secret is built as YAML and piped through stdin, so it
 * is not in `ps` and not in a shell history. A key that already exists is left alone — rotating it
 * makes every ciphertext in the rc file unreadable, which is a decision for whoever holds the data, not
 * for a provisioning step.
 */
/**
 * Whether the cluster's key is the one this folder seals with, or nothing when it holds none.
 *
 * The key is applied by the folder's own `secretGenerator`, which is what makes one command the whole
 * of a tenant's half — and what makes this check necessary: an apply would happily replace a key the
 * namespace already uses, and every value in the rc file would then decrypt to nothing. So a
 * mismatch is a refusal, with the three ways out named, rather than an apply nobody asked for
 * (D-1029).
 */
const keyConflict = (namespace: string, key: string): boolean => {
    const read = spawnSync(
        'kubectl',
        [
            '-n',
            namespace,
            'get',
            'secret',
            MASTER_KEY_SECRET,
            '-o',
            `jsonpath={.data.${MASTER_KEY_ENV}}`,
        ],
        {encoding: 'utf8'},
    );
    if (read.status !== 0) return false;
    const held = Buffer.from(read.stdout.trim(), 'base64').toString('utf8').trim();
    return held.length > 0 && held !== key;
};

const ensureMasterKey = (
    namespace: string,
    dryRun: boolean,
    context?: ISuiteContext,
    force = false,
): void => {
    if (secretExists(namespace, MASTER_KEY_SECRET) === false) return;
    const key = masterKey(context?.root ?? process.cwd());
    if (!keyConflict(namespace, key)) {
        say(`  ${MASTER_KEY_SECRET} in ${namespace} matches this folder's key`);
        return;
    }
    if (force) {
        // Said out loud rather than reported as a match: the apply is about to replace a key the
        // namespace uses, and the values sealed with the old one stop decrypting.
        say(
            `  ${MASTER_KEY_SECRET} in ${namespace} will be replaced by --force — re-seal the rc file ` +
                'with this folder’s key, and restart the workloads that read it',
        );
        return;
    }
    throw new Error(
        `${namespace} already holds a ${MASTER_KEY_SECRET} with a different key, and applying this ` +
            'folder would replace it — every value the rc file sealed with the old key would decrypt ' +
            'to nothing. Three ways out: seal again with the cluster’s key (EXPORT it, then ' +
            '`blong-kustomize provision seal`), point this folder at that key, or pass ' +
            '`--new-key --force` to rotate deliberately and re-seal the rc file with the new one.' +
            (dryRun ? ' (dry run: nothing was applied)' : ''),
    );
};

/** The namespace a provision folder declares, so `-n` and the manifests cannot disagree. */
/** Build a kustomization and apply it, in one pipe: what the folder says is what the cluster gets. */
const kustomizeApply = (path: string, namespace: string | undefined, dryRun: boolean): number => {
    const build = spawnSync('kubectl', ['kustomize', path], {encoding: 'utf8'});
    if (build.error) throw new Error(`kubectl kustomize: ${build.error.message}`);
    if (build.status !== 0) {
        throw new Error(`kubectl kustomize ${path} failed: ${build.stderr.trim()}`);
    }
    const args = ['apply', '-f', '-', ...(namespace ? ['-n', namespace] : [])];
    return kubectl(args, {input: build.stdout, dryRun});
};

/**
 * The namespace this tenant provisions into: the flag, else the folder's own declaration, else what
 * the working directory suggests.
 *
 * The folder is authoritative because it is the tenant's answer: `init --namespace=shop` writes it, and
 * a `provision` run from anywhere else must not silently provision a namespace named after the current
 * directory.
 */
const tenantNamespace = (context: ISuiteContext, flags: IProvisionFlags): string => {
    const folder = context.provision;
    return (
        flags.namespace ?? (folder ? provisionNamespace(folder) : undefined) ?? context.namespace
    );
};

const provisionNamespace = (provision: string): string | undefined => {
    const file = join(provision, 'kustomization.yaml');
    if (!existsSync(file)) return undefined;
    return /^namespace:\s*(\S+)\s*$/m.exec(readFileSync(file, 'utf8'))?.[1];
};

export interface IProvisionFlags {
    suite?: string;
    namespace?: string;
    tree?: string;
    cr?: string;
    dump?: string;
    database?: string;
    mysqlNamespace?: string;
    mysqlDeploy?: string;
    dir?: string;
    paths?: string[];
    set?: string[];
    file?: string;
    value?: string;
    random?: number | true;
    force?: boolean;
    allowSample?: boolean;
    newKey?: boolean;
    forceRc?: boolean;
    noDeclaration?: boolean;
    /** The namespaces a pass's services run in, when the folder cannot say — repeatable. */
    servicesNamespace?: string[];
    operator?: string;
    operatorNamespace?: string;
    dryRun?: boolean;
    json?: boolean;
}

/** A flag that repeats (`--set a=b --set c=d`) or lists with commas; either spelling is one list. */
const listOf = (value: unknown): string[] | undefined =>
    Array.isArray(value) ? value.map(String) : pathList(value);

const pathList = (value: unknown): string[] | undefined =>
    typeof value === 'string' && value.trim()
        ? value
              .split(',')
              .map(entry => entry.trim())
              .filter(Boolean)
        : undefined;

/** Read the flags both command families accept, dropping what was not given. */
export const flagsOf = (argv: Record<string, unknown>): IProvisionFlags => ({
    ...(typeof argv.suite === 'string' ? {suite: argv.suite} : {}),
    ...(typeof argv.namespace === 'string' ? {namespace: argv.namespace} : {}),
    ...(typeof argv.tree === 'string' ? {tree: argv.tree} : {}),
    ...(typeof argv.cr === 'string' ? {cr: argv.cr} : {}),
    ...(typeof argv.dump === 'string' ? {dump: argv.dump} : {}),
    ...(typeof argv.database === 'string' ? {database: argv.database} : {}),
    ...(typeof argv['mysql-namespace'] === 'string'
        ? {mysqlNamespace: argv['mysql-namespace']}
        : {}),
    ...(typeof argv['mysql-deploy'] === 'string' ? {mysqlDeploy: argv['mysql-deploy']} : {}),
    ...(typeof argv.dir === 'string' ? {dir: argv.dir} : {}),
    ...(listOf(argv.set) ? {set: listOf(argv.set)} : {}),
    ...(pathList(argv.paths) ? {paths: pathList(argv.paths)} : {}),
    ...(typeof argv.file === 'string' ? {file: argv.file} : {}),
    ...(typeof argv.value === 'string' ? {value: argv.value} : {}),
    ...(argv.random === undefined
        ? {}
        : {random: typeof argv.random === 'string' ? Number(argv.random) : true}),
    ...(argv.force === true ? {force: true} : {}),
    ...(argv.new === true ? {newKey: true} : {}),
    ...(argv['force-rc'] === true ? {forceRc: true} : {}),
    // `--no-…` is not available: minimist reads it as the negation of `…` (`{declaration: false}`),
    // which is a different flag from the one a caller thinks they wrote.
    ...(argv['without-declaration'] === true ? {noDeclaration: true} : {}),
    ...(listOf(argv['services-namespace'])
        ? {servicesNamespace: listOf(argv['services-namespace'])}
        : {}),
    ...(typeof argv.operator === 'string' ? {operator: argv.operator} : {}),
    ...(typeof argv['operator-namespace'] === 'string'
        ? {operatorNamespace: argv['operator-namespace']}
        : {}),
    ...(argv['allow-sample'] === true ? {allowSample: true} : {}),
    ...(argv['dry-run'] === true ? {dryRun: true} : {}),
    ...(argv.json === true ? {json: true} : {}),
});

/**
 * Write one value into a YAML file at a dotted path, leaving comments and the rest of the document
 * as they are.
 *
 * A pipeline knows the credentials it provisions with, and a command that made it paste them into a
 * file would be a command that needs a heredoc beside it. `--secret` is deliberately not a flag: a
 * value is sealed afterwards (`secret seal`), so the file never holds the plaintext for longer than
 * the edit.
 */
const setIn = (file: string, path: string, value: string): void => {
    const document = parseDocument(readFileSync(file, 'utf8'));
    if (document.errors.length) throw new Error(`${file}: ${document.errors[0].message}`);
    document.setIn(path.split('.'), value);
    writeFileSync(file, document.toString());
};

const write = (file: string, content: string, force: boolean): boolean => {
    if (existsSync(file) && !force) {
        say(`  ${file} exists; left as it is (--force rewrites it)`);
        return false;
    }
    mkdirSync(dirname(file), {recursive: true});
    writeFileSync(file, content);
    say(`  wrote ${file}`);
    return true;
};

/**
 * `init` — the two files a tenant edits, in a suite or in an empty folder.
 *
 * It writes the manifests that create the namespace and the rc Secret, and an rc file whose secrets are
 * already sealed when the master key is in the environment. Nothing is invented that a tenant has to
 * discover later: every value it cannot know is a placeholder with the sentence that explains it.
 */
/**
 * The master key this tenant holds.
 *
 * `BLONG_MASTER_KEY` wins — it is what a process reads and what a pipeline exports — and the file
 * `init` writes is the tenant's own copy for a machine that has neither: the same value ends up in the
 * `blong-master-key` Secret, which is the canonical place for it, and this one exists only so that
 * provisioning and sealing work without a second step. It is written 0600 inside a folder that is
 * ignored whole, and never printed.
 */
export const masterKey = (root: string = process.cwd()): string => {
    try {
        return masterKeyFrom();
    } catch (missing) {
        const file = join(root, PROVISION_DIR, MASTER_KEY_FILE);
        if (existsSync(file)) {
            const key = readFileSync(file, 'utf8').trim();
            if (!/^[0-9a-fA-F]{64}$/.test(key)) {
                throw new Error(`${file} does not hold a 64-character hex key`);
            }
            return key;
        }
        throw missing;
    }
};

/**
 * The services namespace a declaration names, when it names one.
 *
 * Read back from the declaration rather than asked for, because the declaration is where the
 * tenant says which services it brings and where they run: a folder made from a suite's example
 * already carries `services` and `servicesNamespace`, and a caller who brings its own declaration
 * passes `--services-namespace` (@@T-837). A service a declaration switched *off* still counts:
 * its workload may be gone, and the objects it left behind are the pass's to find and remove.
 */
const declaredServicesNamespace = (text: string): string[] => {
    const document = parseDocument(text);
    if (document.errors.length) {
        throw new Error(`the declaration is not valid YAML: ${document.errors[0].message}`);
    }
    // `getIn` rather than `get`: a node's properties are not a plain object's, so `spec.services`
    // reads as undefined on the map itself and the derivation would silently find nothing.
    const named = document.getIn(['spec', 'servicesNamespace']);
    const services = document.getIn(['spec', 'services']) as {items?: unknown[]} | undefined;
    if (typeof named !== 'string' && (services?.items?.length ?? 0) === 0) return [];
    return [typeof named === 'string' ? named : DEFAULT_SERVICES_NAMESPACE];
};

/**
 * The namespaces a reconcile pass reads, and therefore the ones that need a grant.
 *
 * The suite's own is one of them; the rest are the namespace its services run in. A pass discovers
 * what a suite owns by its labels, so it *reads* the services namespace whether or not the active
 * profile still generates a workload there. Rights limited to the suite's namespace fail on that
 * read rather than on an apply, which is how a pass reports five errors and never converges.
 */
const grantNamespaces = (
    folder: string,
    flags: IProvisionFlags,
    tenant: string,
): {namespaces: string[]; extras: string[]} => {
    const file = join(folder, 'blongdeployment.yaml');
    const declared = existsSync(file) ? declaredServicesNamespace(readFileSync(file, 'utf8')) : [];
    // A folder the tenant already has is part of the answer: `--without-declaration` leaves nothing
    // in the folder to read, and a namespace granted once should not need the flag that named it a
    // second time. Removing one is deleting its folder, which is an act rather than an omission.
    const existing = join(folder, 'namespaces');
    const folders = existsSync(existing)
        ? readdirSync(existing)
              .filter(name => statSync(join(existing, name)).isDirectory())
              .sort()
        : [];
    const namespaces = [
        ...new Set(
            [tenant, ...folders, ...(flags.servicesNamespace ?? []), ...declared].filter(Boolean),
        ),
    ];
    return {namespaces, extras: namespaces.filter(namespace => namespace !== tenant)};
};

/**
 * The Namespace objects the folder creates: the tenant's own, and one per namespace a pass reads.
 *
 * A pass never applies a `Namespace` — the install creates them and owns their lifecycle
 * (`INSTALL_OWNED_KINDS`) — so a services namespace nobody creates is a namespace the operator's
 * grant cannot land in: a Role for a namespace that is not there is refused by the API server.
 * These travel as their own files and are applied *ahead of* the kustomization, because the root
 * `namespace:` field renames every `Namespace` object the composer meets, and an extra one would
 * collide with the tenant's own (@@F-440).
 */
const namespaceResources = (
    tenant: string,
    extras: string[],
    suite: string,
): Record<string, string> => {
    const labels = [
        `    app.kubernetes.io/managed-by: blong-kustomize`,
        `    app.kubernetes.io/part-of: ${suite}`,
    ];
    const files: Record<string, string> = {
        'namespace.yaml': [
            "# The namespace the declaration lives in. A namespace is the tenant's, not the",
            "# operator's: a reconcile pass is started by a declaration, and a declaration is a",
            '# namespaced object.',
            'apiVersion: v1',
            'kind: Namespace',
            'metadata:',
            `  name: ${tenant}`,
            '  labels:',
            ...labels,
            '',
        ].join('\n'),
    };
    for (const namespace of extras) {
        files[`namespaces/${namespace}/namespace.yaml`] = [
            '# Where this deployment’s services run. A pass reads it — the objects a service left',
            '# behind are found by label whether or not the service still runs — so the tenant',
            '# creates it before granting the operator anything in it.',
            'apiVersion: v1',
            'kind: Namespace',
            'metadata:',
            `  name: ${namespace}`,
            '  labels:',
            ...labels,
            '',
        ].join('\n');
    }
    return files;
};

/** The grants the operator runs under, in this tenant's namespaces: the one part a pass refuses. */
const grantResources = (
    tenant: string,
    extras: string[],
    suite: string,
): Record<string, string> => {
    const labels = [
        `    app.kubernetes.io/managed-by: blong-kustomize`,
        `    app.kubernetes.io/part-of: ${suite}`,
    ];
    const files: Record<string, string> = {};
    for (const namespace of [tenant, ...extras]) {
        // The tenant's own pair keeps the plain name — it is the one a reader looks for, and a
        // suffix would make every folder's first file a special case. The object keeps the
        // operator's name in every namespace, which is what `isSelfGrant` recognises.
        const folder = namespace === tenant ? 'grants' : join('namespaces', namespace);
        files[join(folder, 'blong-operator-role.yaml')] = [
            "# The operator's rights in this namespace. A pass refuses to write the objects it runs",
            "# under (`isSelfGrant` in the realm's `apply.ts`), so they are the tenant's to apply — and",
            "# the rules are the operator's own, `OPERATOR_NAMESPACED_RULES`, so the file and the verbs",
            '# cannot disagree.',
            'apiVersion: rbac.authorization.k8s.io/v1',
            'kind: Role',
            'metadata:',
            `  name: ${OPERATOR_NAME}`,
            `  namespace: ${namespace}`,
            '  labels:',
            ...labels,
            'rules:',
            ...OPERATOR_NAMESPACED_RULES.flatMap(rule => [
                `  - apiGroups: [${rule.apiGroups.map(group => `'${group}'`).join(', ')}]`,
                `    resources: [${rule.resources.join(', ')}]`,
                `    verbs: [${rule.verbs.join(', ')}]`,
            ]),
            '',
        ].join('\n');
        files[join(folder, 'blong-operator-rolebinding.yaml')] = [
            'apiVersion: rbac.authorization.k8s.io/v1',
            'kind: RoleBinding',
            'metadata:',
            `  name: ${OPERATOR_NAME}`,
            `  namespace: ${namespace}`,
            '  labels:',
            ...labels,
            'roleRef:',
            '  apiGroup: rbac.authorization.k8s.io',
            '  kind: Role',
            `  name: ${OPERATOR_NAME}`,
            'subjects:',
            '  - kind: ServiceAccount',
            `    name: ${OPERATOR_NAME}`,
            `    namespace: ${OPERATOR_NAMESPACE}`,
            '',
        ].join('\n');
    }
    // One role for the whole cluster, because its rules are the same for every suite; the binding
    // is not, because its subject is this suite's identity.
    files['grants/auth-review.yaml'] = [
        "# The UI's right to ask the cluster about a caller: a `TokenReview` and a",
        '# `SubjectAccessReview`, both cluster-scoped. Cluster-scoped, so a pass may not write it.',
        'apiVersion: rbac.authorization.k8s.io/v1',
        'kind: ClusterRole',
        'metadata:',
        `  name: ${AUTH_REVIEW_ROLE}`,
        '  labels:',
        ...labels,
        'rules:',
        ...AUTH_REVIEW_RULES.flatMap(rule => [
            `  - apiGroups: [${rule.apiGroups.map(group => `'${group}'`).join(', ')}]`,
            `    resources: [${rule.resources.join(', ')}]`,
            `    verbs: [${rule.verbs.join(', ')}]`,
        ]),
        '',
    ].join('\n');
    files['grants/auth-review-binding.yaml'] = [
        'apiVersion: rbac.authorization.k8s.io/v1',
        'kind: ClusterRoleBinding',
        'metadata:',
        `  name: ${suite === tenant ? tenant : `${tenant}-${suite}`}-${AUTH_REVIEW_ROLE}`,
        '  labels:',
        ...labels,
        'roleRef:',
        '  apiGroup: rbac.authorization.k8s.io',
        '  kind: ClusterRole',
        `  name: ${AUTH_REVIEW_ROLE}`,
        'subjects:',
        '  - kind: ServiceAccount',
        `    name: ${SUITE_SERVICE_ACCOUNT}`,
        `    namespace: ${tenant}`,
        '',
    ].join('\n');
    return files;
};

/**
 * The folder's kustomization, generated: the namespace, the grants in the order a pass needs them,
 * the tenant's rc Secret and the declaration.
 *
 * Rewritten by `provision` as well as written by `init`, because the grants follow what the
 * declaration names: a tenant that adds a service to its declaration and re-runs `provision` gets
 * the grant that service's namespace needs, without editing a generated file by hand (@@T-837).
 *
 * The extra namespaces are deliberately *not* in `resources`: the `namespace:` field below renames
 * every `Namespace` object the composer meets, so a second one would be renamed into the first and
 * the two would collide. `provision` applies `namespaces/` ahead of this folder instead (@@F-440).
 */
const kustomizationText = (namespace: string, grants: string[], hasDeclaration: boolean): string =>
    [
        '# What a tenant has before its declaration converges, applied together:',
        '#',
        '#     kubectl kustomize system/provision | kubectl apply -f -',
        '#',
        "# The namespace, the rights the operator runs under here, the tenant's rc Secret and the",
        '# declaration — in that order, which is the order `kubectl apply` uses. Everything else a',
        "# deployment needs is the operator's.",
        '#',
        '# Generated: `provision` rewrites this file when the grants change, so a tenant edits the rc',
        '# file rather than this one.',
        'apiVersion: kustomize.config.k8s.io/v1beta1',
        'kind: Kustomization',
        `namespace: ${namespace}`,
        'resources:',
        '  - namespace.yaml',
        ...grants.map(path => `  - ${path}`),
        ...(hasDeclaration ? ['  - blongdeployment.yaml'] : []),
        'secretGenerator:',
        '  - name: blong-releaserc-etc',
        '    files:',
        '      - blong_releaserc=rc/blong_releaserc',
        '    options:',
        '      # The name is fixed: the workloads read it, and a hash suffix would rename it',
        '      # under them on every value change.',
        '      disableNameSuffixHash: true',
        '  # The key the rc file is sealed with, written by `init` beside it. Listed here rather',
        '  # than applied by the command, so the folder is the whole of what a tenant provisions —',
        '  # and `provision` refuses to apply it when the cluster already holds a different key,',
        '  # because swapping one under a sealed file makes every value unreadable (D-1029).',
        '  - name: blong-master-key',
        '    files:',
        '      - BLONG_MASTER_KEY=.master_key',
        '    options:',
        '      disableNameSuffixHash: true',
        '',
    ].join('\n');

/**
 * Bring the folder's grants up to what the declaration names, before it is applied.
 *
 * Two things a tenant would otherwise do by hand and forget: add the pair for a namespace a pass
 * reads, and add the namespace itself — a pass may not write a `Namespace`, so a grant for one
 * nobody created is refused by the API server. A file this derives and no longer derives is
 * removed, so the folder stays the whole of what the tenant provisions (@@T-837).
 */
const syncGrants = (
    folder: string,
    tenant: string,
    suite: string,
    flags: IProvisionFlags,
): void => {
    const {extras} = grantNamespaces(folder, flags, tenant);
    const files = {
        ...namespaceResources(tenant, extras, suite),
        ...grantResources(tenant, extras, suite),
    };
    for (const [path, text] of Object.entries(files)) {
        const file = join(folder, path);
        const current = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
        if (current === text) continue;
        mkdirSync(dirname(file), {recursive: true});
        writeFileSync(file, text);
        say(`  ${current === undefined ? 'wrote' : 'updated'} ${file}`);
    }
    // A namespace this tenant stopped naming is a file to remove: the grant for it would otherwise
    // be re-applied by the next folder run, to a namespace nothing needs.
    const keep = new Set(Object.keys(files));
    for (const stale of staleGrantFiles(folder)) {
        if (keep.has(stale)) continue;
        rmSync(join(folder, stale));
        say(`  removed ${join(folder, stale)}`);
    }
    const kustomization = join(folder, 'kustomization.yaml');
    const hasDeclaration =
        existsSync(join(folder, 'blongdeployment.yaml')) &&
        existsSync(kustomization) &&
        /^\s*-\s*blongdeployment\.yaml\s*$/m.test(readFileSync(kustomization, 'utf8'));
    const text = kustomizationText(
        tenant,
        tenantGrants(grantResources(tenant, extras, suite)),
        hasDeclaration,
    );
    if (readFileSync(kustomization, 'utf8') !== text) {
        writeFileSync(kustomization, text);
        say(`  updated ${kustomization}`);
    }
};

/** The grant files `syncGrants` owns in the tenant's own half — the suffix-free pair, and nothing else. */
const staleGrantFiles = (folder: string): string[] => {
    const grants = join(folder, 'grants');
    return (existsSync(grants) ? readdirSync(grants) : [])
        .filter(name => /^blong-operator-(role|rolebinding)(-[^.]*)?\.yaml$/.test(name))
        .map(name => join('grants', name));
};

/** The files the folder's kustomization lists: the tenant's own half, and nothing an extra carries. */
const tenantGrants = (grants: Record<string, string>): string[] =>
    Object.keys(grants).filter(path => path.startsWith('grants/'));

/** The declaration a tenant keeps: the tree's example when there is one, promoted to a draft. */
const declaration = (
    root: string,
    context: ISuiteContext,
    namespace: string,
    suite: string,
): string => {
    const example = resolve(root, 'system', 'kustomize', 'example', 'blongdeployment.yaml');
    if (existsSync(example)) {
        const document = parseDocument(readFileSync(example, 'utf8'));
        // A sample names every deployment value PLACEHOLDER; `draft: true` is what lets the tenant
        // create the declaration before a release names an artifact, and converge nothing until then.
        document.setIn(['spec', 'draft'], true);
        const text = document.toString();
        return text.includes('draft: true') ? text : `${text}\n`;
    }
    return [
        '# The declaration. A blanket sample for a folder that has no tree to copy one from:',
        '# `spec.draft` keeps a pass from converging until a release names an artifact, and every',
        '# value a deployment owns — the hosts, the artifact — is filled in before that release.',
        'apiVersion: blong.feasible.one/v1alpha1',
        'kind: BlongDeployment',
        'metadata:',
        `  name: ${suite}`,
        `  namespace: ${namespace}`,
        'spec:',
        '  draft: true',
        '  entry: /opt/deploy/suite/index.ts',
        '  # The volume, empty, because a release patches `spec.suiteVolume.artifact` and a',
        '  # JSON-patch `add` needs its parent to exist: a declaration without one makes the',
        '  # first release fail on a path rather than on anything it was asked to do.',
        '  suiteVolume:',
        '    artifact:',
        '      source: url',
        '      url: ""',
        '',
    ].join('\n');
};

/**
 * `init` — every file a tenant needs, in one run.
 *
 * What it writes is one folder: the namespace, the declaration as a draft, the grants a pass refuses,
 * the kustomization that applies them together, the rc file the tenant edits, and the master key the
 * rc is sealed with. The three things a tenant then does are the three the command prints — edit the
 * rc, seal it, provision (@@D-1027).
 */
const init = (context: ISuiteContext, flags: IProvisionFlags): number => {
    const root = flags.dir ? resolve(flags.dir) : context.root;
    const provision = join(root, PROVISION_DIR);
    const suite = flags.suite ?? context.name;
    const namespace = flags.namespace ?? context.namespace;
    say(`init: ${suite} in ${namespace}`);
    // What was found and where the files go, as two facts: a `--dir` target is not the package that
    // named the tenant, and one line for both read as though it were.
    say(
        context.package
            ? `  suite ${context.root}`
            : '  generic configuration: no package above this folder',
    );
    say(`  writing to ${root}`);
    const force = flags.force === true;
    write(join(provision, '.gitignore'), ['*', ''].join('\n'), force);
    // The declaration comes first because it is what the grants are derived from: a tenant that
    // brings services needs the operator granted in the namespace those run in, and the folder is
    // the only thing that grants anything (@@T-837).
    //
    // A tenant whose declaration is produced somewhere else — a pipeline that applies the tree it
    // generated, or a GitOps seam — asks for the folder without one: applying a skeleton beside the
    // real declaration would put two of them in the namespace, and the one that converged first
    // names an artifact nobody published @@D-1030.
    if (flags.noDeclaration !== true) {
        write(
            join(provision, 'blongdeployment.yaml'),
            declaration(root, context, namespace, suite),
            force,
        );
    }
    const {extras} = grantNamespaces(provision, flags, namespace);
    for (const [path, text] of Object.entries(namespaceResources(namespace, extras, suite))) {
        write(join(provision, path), text, force);
    }
    const grants = grantResources(namespace, extras, suite);
    for (const [path, text] of Object.entries(grants)) {
        write(join(provision, path), text, force);
    }
    write(
        join(provision, 'kustomization.yaml'),
        kustomizationText(
            namespace,
            tenantGrants(grants),
            flags.noDeclaration !== true && existsSync(join(provision, 'blongdeployment.yaml')),
        ),
        force,
    );
    // The rc file itself, not a sample of it. A value this command cannot know is a *comment*, not an
    // empty string: the rc merges over the source configuration, so `user: ""` would override whatever
    // default the suite declared (@@D-1026). A secret is marked `# seal` — the well-known names are
    // sealed without the marker — and `provision` does the sealing (@@D-1027).
    const rcFile = join(provision, 'rc', 'blong_releaserc');
    write(
        rcFile,
        [
            "# This tenant's answers. Nothing in this folder is committed: it is derived from a",
            '# deployment, and what it holds is what that deployment dials.',
            '#',
            '# A secret is sealed before it is applied: `blong-kustomize provision` seals every value',
            '# under a name that is a secret by convention (`password`, `token`, `secret`, `key`…) and',
            '# every value marked with `# seal` after it. Sealing replaces the plaintext with',
            "# ${decrypt('…')}, which the renderer resolves at load with BLONG_MASTER_KEY.",
            'srv:',
            '  db:',
            '    knex:',
            '      connection:',
            '        host: db',
            '        port: 3306',
            '# The database, the user and the password are this tenant\u2019s answer, and the commented',
            '# lines below are the three it usually owns. A value here replaces what the suite',
            '# declared \u2014 the rc file merges *over* it \u2014 so writing `database:` because the',
            '# suite is called that dials a database its user may not reach. The installation grants',
            '# a user one database, and a suite already names it (found in CI, @@F-861).',
            '# `--set srv.db.knex.connection.user=<user>` fills one in without an editor.',
            `        #   database: ${namespace}`,
            '        #   user:',
            "        #   password: <the tenant's>   # seal",
            '',
        ].join('\n'),
        // The rc file is the tenant's answers, and the only copy of them: a rewrite that takes it
        // back costs a credential, so `--force` leaves it alone and `--force-rc` says so out loud.
        flags.forceRc === true,
    );
    const keyFile = join(provision, MASTER_KEY_FILE);
    // `--force` rewrites files; it does not rotate the key. Rotating makes every value the file
    // sealed unreadable and leaves the namespace's Secret holding another key, which is a decision
    // with a migration in it, so it has a flag of its own.
    if (
        flags.newKey === true &&
        flags.force !== true &&
        secretExists(namespace, MASTER_KEY_SECRET)
    ) {
        // A key the namespace already holds is the one its pods decrypt with: minting another makes
        // every sealed value in the rc file unreadable and leaves the Secret holding the old one.
        // That is a rotation with a migration in it, so it is asked for twice.
        throw new Error(
            `${MASTER_KEY_SECRET} already exists in ${namespace}: minting another key would make ` +
                'every sealed value in the rc file unreadable while the Secret kept the old one. ' +
                'Re-seal with the current key, or pass --new-key --force and update the Secret and ' +
                'the rc file together.',
        );
    }
    if (!existsSync(keyFile) || flags.newKey === true) {
        mkdirSync(dirname(keyFile), {recursive: true});
        // The environment's key wins where it is set, and the file is what the folder seals with —
        // so writing a random one beside an exported one leaves a folder that `provision` refuses
        // on every run, comparing two keys that were never meant to differ.
        const fromEnvironment = (() => {
            try {
                return masterKeyFrom();
            } catch {
                return undefined;
            }
        })();
        // No trailing newline: `secretGenerator` copies the file's bytes into the Secret's value, so a
        // newline would be part of the key and every sealed value would fail to decrypt with it.
        writeFileSync(keyFile, fromEnvironment ?? masterKeyGenerate(), {mode: 0o600});
        say(
            `  wrote ${keyFile} (0600, ignored with the folder)` +
                (fromEnvironment ? ', from BLONG_MASTER_KEY' : ''),
        );
    } else {
        say(`  ${keyFile} exists; left as it is (--new-key mints another)`);
    }
    // `--set a.b=value` writes what the caller already knows — the credentials a pipeline holds —
    // so the file needs no hand edit and the command needs no heredoc beside it.
    for (const entry of flags.set ?? []) {
        const at = entry.indexOf('=');
        if (at < 1) throw new Error(`--set expects path=value, not '${entry}'`);
        setIn(rcFile, entry.slice(0, at), entry.slice(at + 1));
        say(`  set ${entry.slice(0, at)}`);
    }
    say('');
    say('next:');
    say(`  1. edit ${join(PROVISION_DIR, 'rc', 'blong_releaserc')} — the values this tenant dials`);
    say(
        '  2. blong-kustomize provision           # seals the rc, applies the folder, creates the key',
    );
    say('  3. release the suite — the first release names the artifact and clears `spec.draft`');
    return 0;
};

/**
 * Seal the values in this tenant's rc file: the ones marked `# seal`, and the ones under a name that is
 * a secret by convention.
 *
 * A file with nothing to seal is not rewritten, so the call is safe on every provision and a tenant can
 * edit the file by hand between runs. A path left empty is reported rather than sealed: an empty value
 * overrides a default, which is the one thing a tenant file must not do (@@D-1026).
 */
const seal = (context: ISuiteContext, flags: IProvisionFlags): number => {
    const rcFile = join(
        context.provision ?? join(context.root, PROVISION_DIR),
        'rc',
        'blong_releaserc',
    );
    if (!existsSync(rcFile)) {
        throw new Error(
            `no rc file at ${rcFile}: \`blong-kustomize init\` writes it, with what it can know and ` +
                'commented places for the rest. It is not committed — it holds what this deployment ' +
                'dials and, sealed, its credentials.',
        );
    }
    const text = readFileSync(rcFile, 'utf8');
    const result = sealMarked(text, masterKey(context.root));
    // A dry run reports what it would seal and writes nothing: the file is the tenant's, and a
    // command that edits it while claiming to change nothing is the kind of surprise that costs a
    // credential.
    if (result.text !== text && flags.dryRun !== true) writeFileSync(rcFile, result.text);
    const would = flags.dryRun === true ? 'would seal' : 'sealed';
    for (const path of result.marked) say(`  ${would} ${path} (marked)`);
    for (const path of result.known) say(`  ${would} ${path} (a secret by name)`);
    for (const path of result.missing) say(`  empty, left as it is: ${path}`);
    if (!result.marked.length && !result.known.length) say('  nothing to seal in the rc file');
    return 0;
};

/** Apply the provision folder: namespace, grants, declaration and rc Secret, in that order. */
/**
 * Whether the cluster's CRD declares `spec.draft`.
 *
 * The CRD is install-owned: a release skips it, so an operator released without it keeps a schema
 * that has no such field — and a structural schema **prunes** what it does not declare, without an
 * error. The declaration would apply, lose `draft`, and converge a suite that names no artifact,
 * which is the failure `draft` exists to prevent. So the check is here, before the apply, where a
 * tenant can see why.
 */
const draftSupported = (): boolean => {
    const read = spawnSync(
        'kubectl',
        [
            'get',
            'crd',
            `blongdeployments.${OPERATOR_GROUP}`,
            '-o',
            'jsonpath={.spec.versions[0].schema.openAPIV3Schema.properties.spec.properties.draft}',
        ],
        {encoding: 'utf8'},
    );
    return read.status === 0 && read.stdout.trim().length > 0;
};

const apply = (context: ISuiteContext, flags: IProvisionFlags): number => {
    const folder = context.provision ?? join(context.root, PROVISION_DIR);
    if (!existsSync(join(folder, 'kustomization.yaml'))) {
        throw new Error(
            `no provision folder at ${folder}: \`blong-kustomize init\` writes one — the namespace, ` +
                'the grants, the declaration and the rc Secret, which are the parts of a deployment a ' +
                'reconcile pass cannot write itself.',
        );
    }
    const namespace = tenantNamespace(context, flags);
    say(`provision: ${namespace}`);
    // The grants follow the declaration, so they are brought up to date before anything is applied:
    // a tenant that added a service since `init` gets the grant its namespace needs without
    // re-creating the folder (@@T-837).
    if (flags.dryRun !== true) syncGrants(folder, namespace, flags.suite ?? context.name, flags);
    // Whether the folder *applies* the declaration, not merely whether the file is there: a tenant
    // whose cluster cannot honour `draft` comments the line out and keeps the file for later.
    const declares =
        existsSync(join(folder, 'blongdeployment.yaml')) &&
        /^\s*-\s*blongdeployment\.yaml\s*$/m.test(
            readFileSync(join(folder, 'kustomization.yaml'), 'utf8'),
        );
    if (declares && flags.dryRun !== true && !draftSupported()) {
        throw new Error(
            `the cluster's CRD (blongdeployments.${OPERATOR_GROUP}) declares no \`spec.draft\`, so a ` +
                'draft declaration would be pruned and the suite would converge without an artifact. ' +
                'Apply the install tree first — `npm run deploy` in realm/blong-kustomize, or ' +
                '`kubectl apply -f realm/blong-kustomize/system/operator/base/crd/` — and run this ' +
                'again.',
        );
    }
    // The namespaces a pass reads come before the folder, because a namespaced object cannot be
    // created in a namespace that is not there — and because the folder's root `namespace:` field
    // would rename a `Namespace` it met, so these cannot travel inside it (@@F-440).
    const namespaces = join(folder, 'namespaces');
    for (const name of existsSync(namespaces) ? readdirSync(namespaces).sort() : []) {
        const at = join(namespaces, name);
        if (!statSync(at).isDirectory()) continue;
        // The namespace first and on its own: one `apply -f` of the folder could hand the API
        // server the Role before the namespace it belongs to.
        const created = kubectl(['apply', '-f', join(at, 'namespace.yaml')], {
            dryRun: flags.dryRun === true,
        });
        if (created !== 0) return created;
        const granted = kubectl(['apply', '-f', at], {dryRun: flags.dryRun === true});
        if (granted !== 0) return granted;
    }
    const code = kustomizeApply(folder, undefined, flags.dryRun === true);
    if (code !== 0) return code;
    say('  applied — the declaration is a draft until a release names an artifact');
    return 0;
};

const restore = (context: ISuiteContext, flags: IProvisionFlags): number => {
    if (!flags.dump) {
        throw new Error(
            'no dump named: pass --dump=FILE with a .sql file to restore. Nothing is restored by ' +
                'default — a deployment with no previous data has nothing to copy.',
        );
    }
    const dump = resolve(flags.dump);
    if (!existsSync(dump)) throw new Error(`no dump at ${dump}`);
    const mysqlNamespace = flags.mysqlNamespace ?? 'blong-integration';
    const mysqlDeploy = flags.mysqlDeploy ?? 'mysql';
    const database = flags.database ?? tenantNamespace(context, flags);
    const sql = (statement: string): string[] => [
        '-n',
        mysqlNamespace,
        'exec',
        `deploy/${mysqlDeploy}`,
        '--',
        'sh',
        '-c',
        `mysql -uroot -p"$MYSQL_ROOT_PASSWORD" ${statement}`,
    ];
    const tables = spawnSync(
        'kubectl',
        sql(
            `-N -B -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${database}'"`,
        ),
        {encoding: 'utf8'},
    );
    const count = Number((tables.stdout ?? '').trim() || 0);
    if (count > 0 && flags.force !== true) {
        throw new Error(
            `${database} already holds ${count} table(s). The restore is for a database with no schema ` +
                'yet: the migration adds tables beside what is there, so a second restore duplicates ' +
                'every row. --force restores anyway, into data this command cannot merge.',
        );
    }
    if (flags.dryRun) {
        say(`+ would create ${database} and restore ${dump} into it (dry run)`);
        return 0;
    }
    kubectl(sql(`-e "CREATE DATABASE IF NOT EXISTS ${database} CHARACTER SET utf8mb4"`));
    // The dump travels on stdin: a file path in `kubectl exec` would need a copy into the pod, and the
    // redirect belongs to this process, not to the shell that runs it.
    process.stderr.write(`+ kubectl exec ... mysql ${database} < ${dump}\n`);
    const loaded = spawnSync(
        'kubectl',
        [
            '-n',
            mysqlNamespace,
            'exec',
            '-i',
            `deploy/${mysqlDeploy}`,
            '--',
            'sh',
            '-c',
            `mysql -uroot -p"$MYSQL_ROOT_PASSWORD" ${database}`,
        ],
        {input: readFileSync(dump), stdio: ['pipe', 'inherit', 'inherit']},
    );
    if (loaded.status !== 0) throw new Error(`restoring ${dump} into ${database} failed`);
    say(`restored ${dump} into ${database}`);
    return 0;
};

const verify = (context: ISuiteContext, flags: IProvisionFlags): number => {
    const operator = flags.operator ?? 'blong-operator';
    const operatorNamespace = flags.operatorNamespace ?? 'blong-system';
    const namespace = tenantNamespace(context, flags);
    const folder = context.provision ?? join(context.root, PROVISION_DIR);
    const {namespaces} = grantNamespaces(folder, flags, namespace);
    kubectl(['-n', namespace, 'get', 'secret', MASTER_KEY_SECRET], {dryRun: flags.dryRun});
    // The check worth having: the operator's own identity asking for the verb its code uses for the
    // suite's identity. A `no` here is the first pass failing with `Kubernetes Access Forbidden` —
    // and every namespace the pass reads is asked about, because a grant in one of them says nothing
    // about the others, and the namespace a service runs in is the one that gets forgotten.
    for (const granted of namespaces) {
        say(`  ${operator} in ${granted}:`);
        kubectl(
            [
                'auth',
                'can-i',
                `--as=system:serviceaccount:${operatorNamespace}:${operator}`,
                'create',
                'serviceaccounts',
                '-n',
                granted,
            ],
            {dryRun: flags.dryRun},
        );
    }
    kubectl(['-n', namespace, 'get', 'blongdeployment'], {dryRun: flags.dryRun});
    return 0;
};

/** `provision <verb>` */
/**
 * `provision [verb]` — the tenant's half of a deployment, applied as one folder.
 *
 * With no verb it is the whole of it: seal the rc file, create the master key's Secret, and apply the
 * provision folder — the namespace, the grants, the declaration and the rc Secret, in the order the
 * kustomization lists them. The verbs exist for the parts a reader wants on their own: `seal` while
 * editing, `apply` after changing the declaration, `verify` to see what a pass will see, and `restore`
 * for the one dump a cut-over copies (@@D-1027).
 */
export const provision = (
    verb: string | undefined,
    context: ISuiteContext,
    flags: IProvisionFlags,
): number => {
    switch (verb) {
        case undefined:
        case '':
            seal(context, flags);
            // Before the apply: the folder writes the key, so a mismatch has to stop it rather than be
            // reported after it has already replaced what the cluster held.
            ensureMasterKey(
                tenantNamespace(context, flags),
                flags.dryRun === true,
                context,
                flags.force === true,
            );
            return apply(context, flags);
        case 'seal':
            return seal(context, flags);
        case 'apply':
            ensureMasterKey(
                tenantNamespace(context, flags),
                flags.dryRun === true,
                context,
                flags.force === true,
            );
            return apply(context, flags);
        case 'restore':
            return restore(context, flags);
        case 'verify':
            return verify(context, flags);
        default:
            throw new Error(
                `provision: unknown verb '${verb ?? ''}'. Run \`blong-kustomize provision --help\`.`,
            );
    }
};

/** `secret <verb>` */
export const secret = (
    verb: string | undefined,
    flags: IProvisionFlags,
    root: string = process.cwd(),
): number => {
    const out = (value: string): void => {
        process.stdout.write(`${value}\n`);
    };
    switch (verb) {
        case 'key': {
            if (flags.newKey === true) {
                out(masterKeyGenerate());
                return 0;
            }
            // Not printed: a key on stdout is a key in a log. What it answers is whether it is usable.
            masterKey(root);
            say(`${MASTER_KEY_ENV} is present and 64 hex characters; --new mints another`);
            return 0;
        }
        case 'value': {
            if (flags.random !== undefined) {
                const bytes = typeof flags.random === 'number' ? flags.random : 32;
                out(secretSeal(masterKey(root), secretRandom(bytes)));
                return 0;
            }
            if (flags.value === undefined)
                throw new Error('pass --value=STRING or --random[=BYTES]');
            out(secretSeal(masterKey(root), flags.value));
            return 0;
        }
        case 'seal': {
            if (!flags.file) throw new Error('pass --file=FILE');
            const file = resolve(flags.file);
            const text = readFileSync(file, 'utf8');
            const paths = flags.paths ?? [];
            const result = sealYaml(text, paths, masterKey(root));
            if (result.text !== text) writeFileSync(file, result.text);
            for (const path of result.sealed) say(`sealed ${path}`);
            for (const path of result.already) say(`already sealed ${path}`);
            for (const path of result.missing) say(`not a string, or not there: ${path}`);
            if (!paths.length) say('nothing named: pass --paths=a.b,c.d');
            return 0;
        }
        case 'open': {
            if (!flags.file) throw new Error('pass --file=FILE');
            const text = readFileSync(resolve(flags.file), 'utf8');
            const paths = flags.paths ?? sealedPaths(text);
            const result = openYaml(text, paths, masterKey(root));
            for (const entry of result.opened) out(`${entry.path}=${entry.value}`);
            for (const path of result.missing) say(`not a string, or not there: ${path}`);
            for (const path of result.plain) say(`not sealed: ${path}`);
            return 0;
        }
        case 'list': {
            if (!flags.file) throw new Error('pass --file=FILE');
            for (const path of sealedPaths(readFileSync(resolve(flags.file), 'utf8'))) out(path);
            return 0;
        }
        default:
            throw new Error(
                `secret: unknown verb '${verb ?? ''}'. Run \`blong-kustomize secret --help\`.`,
            );
    }
};

export {init};
