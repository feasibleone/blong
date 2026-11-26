/**
 * help.ts — what `blong-kustomize --help` says, at three levels.
 *
 * The same shape `blong-dev` prints: the command line alone lists the commands, a command adds its
 * verbs, and a verb adds its parameters and the reason each exists. A coding agent reads it the way a
 * person does — one level at a time, asking only for what it needs next — which is why the text is a
 * registry rather than a paragraph: a command's own help cannot drift from the command, because both
 * are entries in this file (`@@D-1022`).
 *
 * Nothing here mentions a particular suite. A tenant that has no checkout runs
 * `npx @feasibleone/blong-kustomize --help` and reads what to type before it has any files at all.
 */

export interface IHelpOption {
    /** How the flag is spelled, including the value placeholder. */
    name: string;
    description: string;
}

export interface IHelpVerb {
    name: string;
    summary: string;
    /** What the verb provisions or answers, in one paragraph. */
    details?: string;
    options?: IHelpOption[];
}

export interface IHelpCommand {
    name: string;
    summary: string;
    details?: string;
    verbs?: IHelpVerb[];
    options?: IHelpOption[];
}

const OUTPUT: IHelpOption = {
    name: '--output=json',
    description: 'Print the result as JSON (the default when stdout is not a TTY).',
};

const KUBECTL: IHelpOption = {
    name: '--dry-run',
    description: 'Print every command a step would run and change nothing.',
};

export const COMMANDS: readonly IHelpCommand[] = [
    {
        name: 'init',
        summary: 'Write every file a tenant needs, for a suite or from an empty folder',
        details:
            'One run writes one folder: the namespace, the declaration as a draft, the RBAC the operator ' +
            'runs under here — which a pass refuses to write — the kustomization that applies them ' +
            'together, the rc file the tenant edits, and a master key. The grants follow the ' +
            'declaration: a tenant that brings services gets the namespace they run in, and a pair of ' +
            'grant objects in it, because a pass reads that namespace as well as its own. The key is ' +
            '`BLONG_MASTER_KEY` when that is exported and a random one otherwise, written 0600 inside ' +
            'the folder and ignored with it. In a suite the folder names the package; in an empty ' +
            'folder it names the directory, because a tenant that installed the CLI with npx has no ' +
            'checkout to sit beside.',
        options: [
            {
                name: '--suite=NAME',
                description: 'The suite name; defaults to the package or folder.',
            },
            {name: '--namespace=NS', description: 'The namespace the declaration lives in.'},
            {
                name: '--dir=PATH',
                description: 'Where to write; defaults to the suite, else the folder.',
            },
            {name: '--set=path=value', description: 'Fill a value known already; repeats.'},
            {
                name: '--without-declaration',
                description:
                    'Write the folder without a declaration, for a caller that applies its own.',
            },
            {
                name: '--services-namespace=NS',
                description:
                    'A namespace a pass reads, when there is no declaration to say: the one the ' +
                    'services run in. Repeatable, and needed once — the folder keeps it.',
            },
            {
                name: '--force',
                description: 'Rewrite the manifests; the rc file and the key are kept.',
            },
            {
                name: '--force-rc',
                description: 'Rewrite an existing rc file too — it holds the answers.',
            },
            {
                name: '--new-key',
                description: 'Mint another master key, making sealed values unreadable.',
            },
        ],
    },
    {
        name: 'provision',
        summary: 'Seal the rc file, create the master key, and apply the tenant folder',
        details:
            "With no verb it is the whole of a tenant's half: every value in the rc file that is marked " +
            '`# seal` — or held under a name that is a secret by convention — is replaced with ' +
            '`${decrypt(…)}`, the master key is created in the namespace if it is not there, and the ' +
            'folder is applied: namespace, grants, declaration and rc Secret, in the order the ' +
            "kustomization lists them. Everything else a deployment needs is the operator's. The " +
            'grants are re-derived from the declaration first, so a tenant that added a service since ' +
            '`init` gets the grant its namespace needs; the namespaces those grants live in are applied ' +
            'ahead of the folder, because a namespaced object cannot be created in a namespace that is ' +
            'not there.',
        verbs: [
            {
                name: 'seal',
                summary: 'Seal the rc file only',
                details:
                    'Safe on every run: a value already sealed is left alone, a file with nothing to seal ' +
                    'is not rewritten, and a value left empty is reported rather than sealed, because an ' +
                    'empty value would override a default.',
                options: [{name: '--namespace=NS', description: 'The tenant namespace.'}],
            },
            {
                name: 'apply',
                summary: 'Apply the tenant folder only',
                details:
                    "What a pass cannot write: the namespace, the operator's grants, the declaration, and " +
                    'the rc Secret the generator builds from the sealed file.',
                options: [{name: '--namespace=NS', description: 'The tenant namespace.'}, KUBECTL],
            },
            {
                name: 'restore',
                summary: "Restore a SQL dump into the tenant's database (optional, once)",
                details:
                    "A cut-over copies the previous deployment's database before the first converge, " +
                    'because the migration adds a schema *beside* the data rather than filling it. The dump ' +
                    'is a file this command reads; nothing is made up from a name. It refuses a database ' +
                    'that already holds tables unless `--force`.',
                options: [
                    {name: '--dump=FILE', description: 'The .sql file to restore.'},
                    {
                        name: '--database=NAME',
                        description: 'The target database; defaults to the namespace.',
                    },
                    {name: '--mysql-namespace=NS', description: 'Where the MySQL pod runs.'},
                    {
                        name: '--mysql-deploy=NAME',
                        description: 'The MySQL workload; defaults to `mysql`.',
                    },
                    {
                        name: '--force',
                        description: 'Restore into a database that already holds tables.',
                    },
                ],
            },
            {
                name: 'verify',
                summary: 'Read back what a pass will see',
                details:
                    "The one check worth having: the operator's own identity asking for the verb its code " +
                    "uses for the suite's identity. A `no` here is the first pass failing with " +
                    '`Kubernetes Access Forbidden` on every kind.',
                options: [{name: '--namespace=NS', description: 'The tenant namespace.'}],
            },
        ],
        options: [
            {name: '--namespace=NS', description: 'The tenant namespace.'},
            {name: '--set=path=value', description: 'Fill a value before sealing; repeats.'},
            {
                name: '--services-namespace=NS',
                description:
                    'A namespace the services run in, when the folder cannot say. Repeatable; a ' +
                    'namespace already in `namespaces/` needs no flag.',
            },
            KUBECTL,
        ],
    },
    {
        name: 'secret',
        summary: 'Encrypt and decrypt configuration values with BLONG_MASTER_KEY',
        details:
            "A configuration holds `${decrypt('<hex>')}` and the renderer resolves it at load. This is " +
            'what makes an rc file — or `kubectl get secret -o yaml` — safe to read: what it holds is ' +
            'ciphertext. The key is 64 hex characters, read from `BLONG_MASTER_KEY`, which is never ' +
            'printed by this command.',
        verbs: [
            {
                name: 'key',
                summary: 'Check the key in the environment, or mint a new one',
                details:
                    '`--new` prints a fresh key to stdout so it can be piped into a Secret; without it ' +
                    'the command only validates the one in the environment and never echoes it.',
                options: [{name: '--new', description: 'Print a new 32-byte key, hex.'}],
            },
            {
                name: 'value',
                summary: 'Encrypt one value, given or random',
                options: [
                    {name: '--value=STRING', description: 'The plaintext to seal.'},
                    {
                        name: '--random[=BYTES]',
                        description: 'Mint a random plaintext instead; 32 bytes by default.',
                    },
                ],
            },
            {
                name: 'seal',
                summary: 'Encrypt the values at the given paths of a YAML file, in place',
                details:
                    'A path that is missing or already sealed is reported and left alone, so the call is ' +
                    'idempotent and a typo cannot invent a value.',
                options: [
                    {name: '--file=FILE', description: 'The YAML file to rewrite.'},
                    {
                        name: '--paths=a,b.c',
                        description: 'The dotted paths to seal; defaults to every plain secret.',
                    },
                ],
            },
            {
                name: 'open',
                summary: 'Print the plaintext of sealed paths, for a reader who holds the key',
                options: [
                    {name: '--file=FILE', description: 'The YAML file to read.'},
                    {
                        name: '--paths=a,b.c',
                        description: 'The dotted paths; defaults to every sealed one.',
                    },
                ],
            },
            {
                name: 'list',
                summary: 'List the sealed paths of a file without opening any of them',
                options: [{name: '--file=FILE', description: 'The YAML file to read.'}],
            },
        ],
        options: [OUTPUT],
    },
    {
        name: 'release-notify',
        summary: 'Tell a cluster what a release published (patches the declaration)',
        details:
            'The gitops seam is asked first and wins when a target is configured, so a cluster with one ' +
            'operator is never told twice. The answer says which seam ran and carries the summary a ' +
            'workflow or a channel posts; the command exits non-zero when the seam that was asked to ' +
            'write did not — a patch that failed or an operator pass that failed an object — because ' +
            'a release that patched nothing must not read as a green step.',
        options: [
            {name: '--suite=NAME', description: 'The suite whose declaration is patched.'},
            {name: '--version=VERSION', description: 'The version the release published.'},
            {name: '--artifact-url=URL', description: 'Where the artifact can be fetched.'},
            {name: '--artifact-digest=SHA256', description: 'The digest the release recorded.'},
            {name: '--framework-image=IMAGE', description: 'The framework image to move to.'},
            {
                name: '--framework-version=VERSION',
                description: 'The framework version that image is.',
            },
            {name: '--namespace=NS', description: 'The namespace holding the declaration.'},
            OUTPUT,
        ],
    },
    {
        name: 'reconcile',
        summary: 'Run one pass of the operator’s loop and report what it found',
        details:
            'Without `--apply` it only reports, and without `--prune` it deletes nothing. The ' +
            'command exits non-zero when the pass applied nothing or failed an object: a pass that ' +
            'reported five errors and converged nothing is not a step that succeeded.',
        options: [
            {name: '--from=registry|cr', description: 'Where the plan comes from.'},
            {name: '--apply', description: 'Write the cluster, not just the report.'},
            {name: '--prune', description: 'Delete what the declaration stopped naming.'},
            {name: '--name=CR', description: 'The declaration to read.'},
            {name: '--namespace=NS', description: 'The namespace to converge.'},
            {name: '--cache-dir=PATH', description: 'Where the artifact cache is.'},
            OUTPUT,
        ],
    },
    {
        name: 'volume-prune',
        summary: 'Report which retained suite versions are past the retention',
        details: 'A report, not a deletion: only the operator may delete.',
        options: [{name: '--retention=N', description: 'How many versions to keep; 3 by default.'}],
    },
    {
        name: 'keys-ensure',
        summary: 'Create the suite’s gateway keys if the cluster has none',
        options: [{name: '--namespace=NS', description: 'The namespace to look in.'}],
    },
];

const wrap = (text: string, indent: string, width = 96): string => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
        if (line && `${indent}${line} ${word}`.length > width) {
            lines.push(line);
            line = word;
            continue;
        }
        line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
    return lines.map(entry => `${indent}${entry}`).join('\n');
};

const options = (entries: readonly IHelpOption[] | undefined): string =>
    entries?.length
        ? `\nOptions\n${entries
              .map(entry => `  ${entry.name.padEnd(26)} ${entry.description}`)
              .join('\n')}\n`
        : '';

/** Level one: the commands. */
export const renderIndex = (): string =>
    [
        'blong-kustomize — provision and operate a Blong deployment',
        '',
        'Usage',
        ...COMMANDS.map(
            command => `  blong-kustomize ${command.name.padEnd(16)} ${command.summary}`,
        ),
        '',
        'Every command and verb answers `--help`, one level at a time:',
        '',
        '  blong-kustomize --help',
        '  blong-kustomize provision --help',
        '  blong-kustomize secret seal --help',
        '',
        'Options',
        '  --help, -h      Show this help and exit.',
        '',
    ].join('\n');

/** Level two: one command. */
export const renderCommand = (command: IHelpCommand): string =>
    [
        `blong-kustomize ${command.name} — ${command.summary}`,
        '',
        'Usage',
        `  blong-kustomize ${command.name}${command.verbs?.length ? ' <verb>' : ''} [options]`,
        ...(command.verbs ?? []).map(verb => `\n  ${verb.name.padEnd(12)} ${verb.summary}`),
        ...(command.details ? ['', wrap(command.details, '')] : []),
        options(command.options),
    ]
        .filter(entry => entry !== '')
        .join('\n');

/** Level three: one verb. */
export const renderVerb = (command: IHelpCommand, verb: IHelpVerb): string =>
    [
        `blong-kustomize ${command.name} ${verb.name} — ${verb.summary}`,
        '',
        'Usage',
        `  blong-kustomize ${command.name} ${verb.name} [options]`,
        ...(verb.details ? ['', wrap(verb.details, '')] : []),
        options(verb.options),
    ]
        .filter(entry => entry !== '')
        .join('\n');

/**
 * The text `--help` prints for the positionals it was given.
 *
 * `[]` is the command list, one word is a command, two are a command and its verb. An unknown word
 * falls back to the nearest level that exists rather than printing nothing: an agent that mistypes a
 * verb still learns what the command holds.
 */
export const resolveHelp = (positionals: readonly string[]): string => {
    const [commandName, verbName] = positionals;
    const command = COMMANDS.find(entry => entry.name === commandName);
    if (!command) return renderIndex();
    if (!verbName) return renderCommand(command);
    const verb = command.verbs?.find(entry => entry.name === verbName);
    return verb ? renderVerb(command, verb) : renderCommand(command);
};
