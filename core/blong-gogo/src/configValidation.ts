/**
 * Config validation — turn a component's declared `validation` schema into a
 * check of the config block it was handed, with an explanation of what failed.
 *
 * A realm, suite, adapter or orchestrator may declare `validation: blong.type
 * .Object({...})`, describing the keys of its own config block. Until now that
 * schema was declared but never enforced: a config key the component did not
 * know was accepted in silence, which is how a `--x.y=z` addressed one level too
 * shallow cost a long investigation (@@F-370 @@D-547). This module is what makes the
 * declaration load-bearing.
 *
 * Rules that shape it:
 *
 * - **Unknown top-level keys are always checked.** A key the block's structure
 *   does not legitimise is a mistake wherever it lands — that is the `--x.y=z`
 *   addressed one level too shallow (@@F-370 @@D-547). At the platform root the
 *   check is narrowed to the keys the command line introduced, because a shared
 *   rc file legitimately carries keys for suites other than the one loading; a
 *   nested module is judged on all of its keys, since an override reaches it by
 *   name.
 * - **The allow-list is composed, not just declared.** The keys the component's
 *   structure legitimises are added before the check: one key per child module,
 *   the keys its own source config names, and the keys its parent declared for
 *   it. The declared schema is a *partial* description — `codec` declares an
 *   empty schema and still carries `k8s` — so without the rest the check would
 *   fail on the component's own defaults.
 * - **A schema only adds type checks.** `required` and nested unknown keys are
 *   deliberately not enforced: the declared schemas predate enforcement and are
 *   incomplete (`testClient` requires a `test` key its config never sets), so
 *   enforcing them would fail on valid configuration. Tightening this is a
 *   separate step, once the fields are complete (@@T-340).
 */
import {Type, type TObject, type TSchema} from 'typebox';
import Value from 'typebox/value';

/**
 * One error as `Value.Errors` reports it, named structurally because the value
 * package does not export the type in this TypeBox major.
 */
type ValueError = {
    keyword: string;
    instancePath: string;
    params?: Record<string, unknown>;
    message: string;
};

const FRAMEWORK_CONFIG_KEYS: ReadonlySet<string> = new Set([
    // IBaseConfig — the framework components a config block may name.
    'watch',
    'remote',
    'adapter',
    'orchestrator',
    'test',
    'error',
    'gateway',
    'sim',
    'resolution',
    'log',
    'apiSchema',
    'registry',
    'port',
    'codec',
    'local',
    'rpcServer',
    'restFs',
    'systemDebug',
    'mcp',
    'apiGateway',
    'exit',
    // The loader's bookkeeping, merged into every module's block.
    'version',
    'platform',
    'method',
    'env',
    'configName',
    'configNames',
    'configs',
    'config',
    'base',
    'url',
    'pkg',
    'name',
    'children',
    'manifest',
    'framework',
    'id',
    'type',
    'kopi',
    'server',
    'browser',
    // Every component's own level, set as a key of its config block.
    'logLevel',
    // The realms a platform root adds when the suite depends on them.
    'srv',
    'login',
    'core',
    'access',
    'blong',
    'kustomize',
]);

/** One thing wrong with a config block, as a place and a sentence. */
export interface IConfigIssue {
    /** Dotted path of the offending value (`kustomize.outputDir`); `(root)` for the block itself. */
    path: string;
    /** A sentence naming what was expected and what was found. */
    message: string;
}

function isObjectSchema(schema: TSchema | undefined): schema is TObject {
    return Boolean(
        schema &&
        (schema as {type?: unknown}).type === 'object' &&
        (schema as {properties?: unknown}).properties,
    );
}

/**
 * The schema a config block is checked against: what the component declared,
 * plus an unknown-typed placeholder for every other key it is allowed — a child
 * module, a key the module's own source config names, a framework key — with
 * anything left over an unknown top-level key.
 *
 * Only the top level is sealed: the declared schemas are partial, so a nested
 * object is left open (its `required` and extra keys are the component's own
 * business until the schemas are complete).
 */
export function composeConfigSchema(declared: TObject, allowedKeys: Iterable<string>): TObject {
    const properties: Record<string, TSchema> = {...declared.properties};
    for (const key of allowedKeys) properties[key] ??= Type.Unknown();
    // Framework keys win a name collision. `server` and `browser` are the case:
    // the loader puts the platform block under them in every module, while
    // `adapter` declares `server` as the boolean that turns its server children
    // on — the same name for two things, and the platform block is what a module
    // actually receives.
    for (const key of FRAMEWORK_CONFIG_KEYS) properties[key] = Type.Unknown();
    return {
        ...declared,
        properties,
        additionalProperties:
            (declared as {additionalProperties?: unknown}).additionalProperties ?? false,
    } as TObject;
}

/** `/db/host` → `db.host`, and the empty path → `(root)`. */
function dotted(instancePath: string): string {
    if (!instancePath) return '(root)';
    return instancePath
        .replace(/^\//, '')
        .split('/')
        .map(segment => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
        .join('.');
}

function valueAt(root: unknown, instancePath: string): unknown {
    if (!instancePath) return root;
    return instancePath
        .replace(/^\//, '')
        .split('/')
        .map(segment => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
        .reduce<unknown>(
            (node, key) =>
                node && typeof node === 'object'
                    ? (node as Record<string, unknown>)[key]
                    : undefined,
            root,
        );
}

/** Turn one TypeBox error into a sentence a reader can act on. */
function explain(error: ValueError, root: unknown): IConfigIssue {
    const path = dotted(error.instancePath);
    const params = (error.params ?? {}) as Record<string, unknown>;
    switch (error.keyword) {
        case 'additionalProperties': {
            const keys = (params['additionalProperties'] as string[] | undefined) ?? [];
            const where = path === '(root)' ? 'the config block' : `'${path}'`;
            return {
                path,
                message:
                    `unknown key${keys.length > 1 ? 's' : ''} ${keys
                        .map(key => `'${key}'`)
                        .join(', ')} in ${where} — not declared here and matching no child, ` +
                    `port or framework key`,
            };
        }
        case 'type': {
            const expected = params['type'];
            const actual = valueAt(root, error.instancePath);
            return {
                path,
                message: `expected ${String(expected)}, found ${JSON.stringify(actual)}`,
            };
        }
        default:
            return {path, message: error.message};
    }
}

/** Options for {@link validateConfigBlock}. */
export interface IConfigValidationOptions {
    /**
     * Restrict the unknown-key check to these keys.
     *
     * The platform root uses this. A shared rc file is written for a whole
     * repository, so it legitimately carries keys for suites other than the one
     * being loaded (`utBus`, `client`, `demo`, …) — keys no source block of this
     * suite names. At the root those are the developer's own settings, not a
     * mistake; only a key the *command line* introduced may be judged there. A
     * nested module has no such excuse: an override reaches it by name.
     */
    onlyUnknownKeys?: ReadonlySet<string>;
}

/**
 * Validate one component's config block.
 *
 * Reports unknown top-level keys and type mismatches, each with a path and a
 * sentence. `required` and nested unknown keys are not reported — the declared
 * schemas are incomplete (see the module comment).
 *
 * `allowedKeys` widens the check for the keys the component's structure
 * legitimises: its children, the keys its own source config names, and the keys
 * its parent declared for it.
 */
export function validateConfigBlock(
    value: unknown,
    declared: TSchema | undefined,
    allowedKeys: Iterable<string>,
    options: IConfigValidationOptions = {},
): IConfigIssue[] {
    const base = isObjectSchema(declared) ? declared : Type.Object({});
    const schema = composeConfigSchema(base, allowedKeys);
    const issues: IConfigIssue[] = [];
    for (const error of Value.Errors(schema, value)) {
        if (error.keyword === 'required') continue;
        if (error.keyword !== 'additionalProperties') {
            issues.push(explain(error, value));
            continue;
        }
        // Only the block's own level: a nested object is left open on purpose.
        if (error.instancePath !== '') continue;
        const keys = (
            (error.params?.['additionalProperties'] as string[] | undefined) ?? []
        ).filter(key => !options.onlyUnknownKeys || options.onlyUnknownKeys.has(key));
        if (keys.length)
            issues.push(
                explain({...error, params: {...error.params, additionalProperties: keys}}, value),
            );
    }
    return issues;
}

/**
 * A single, multi-line explanation of a failed config validation, ready to throw
 * or log. One line per issue, each naming its path, so a reader fixes them all
 * at once rather than one restart at a time.
 */
export function formatConfigIssues(component: string, issues: IConfigIssue[]): string {
    return (
        `Invalid configuration for ${component}:` +
        issues.map(issue => `\n  ${issue.path}: ${issue.message}`).join('')
    );
}
