/**
 * scripts/lib/rules.ts — the decisions a runbook makes, as functions.
 *
 * Everything in this file is a pure function of strings: what a Job's arguments have to be, whether an
 * answer carries private key material, whether a gateway refused a payload. They used to be `grep`,
 * `awk` and `[[ ]]` inside a shell runbook, which meant the rules that matter most — the ones that
 * decide whether a deployment is broken — were the ones nothing could test without a cluster.
 *
 * The shell's own behaviour is part of the contract here. `grep -q 'x' <<<"$answer"` answers a
 * question about a string, so `tokenAnswer` is `includes`; the key-material check is stronger than the
 * `grep -E '"(d|p|q)":'` it replaces, because it reads the JSON and only reports a field a *string*
 * holds, which is what a key is.
 */

/** The private members of a JWK: a deployment that answers with one of these signs for its callers. */
const PRIVATE_JWK_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k'] as const;

const PRIVATE_JWK_PATTERN = new RegExp(`"(${PRIVATE_JWK_MEMBERS.join('|')})":`);

/** Everything a JSON document holds, so the walk does not assume a shape an answer may change. */
const walk = (value: unknown, visit: (object: Record<string, unknown>) => void): void => {
    if (Array.isArray(value)) {
        for (const item of value) walk(item, visit);
        return;
    }
    if (value && typeof value === 'object') {
        const object = value as Record<string, unknown>;
        visit(object);
        for (const item of Object.values(object)) walk(item, visit);
    }
};

/**
 * The private key members an answer carries, by name.
 *
 * An empty list is the claim the runbook makes: the answer carries the public halves only. A body
 * that is not JSON is decided by pattern rather than by parse, so an answer nobody can read is never
 * quietly treated as clean.
 */
export const privateKeyFields = (body: string): string[] => {
    const found = new Set<string>();
    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        if (PRIVATE_JWK_PATTERN.test(body)) return ['<unparsed>'];
        return [];
    }
    walk(parsed, object => {
        for (const member of PRIVATE_JWK_MEMBERS) {
            if (typeof object[member] === 'string') found.add(member);
        }
    });
    return [...found].sort();
};

/**
 * Why a migration Job's arguments are wrong, or `undefined` when they are right.
 *
 * Two rules, and both were written after a deployment that looked healthy and was not (F-414, T-267,
 * T-268). A positional that follows a flag is read by the parser as that flag's value, which is how a
 * Job dialled `127.0.0.1:3306` while every pod beside it connected to `db`. And the positionals are
 * the contract: the entry, `upgrade`, the deployment's intents, and `release` last, because that is
 * the name the rc files it mounts are read by.
 */
export const upgradeArguments = (args: string[]): string | undefined => {
    const positionals: string[] = [];
    let seenFlag = false;
    for (const argument of args) {
        if (argument.startsWith('--')) {
            seenFlag = true;
            continue;
        }
        if (seenFlag) {
            return `the migration step has '${argument}' after a flag, where the parser reads it as that flag's value (T-267)`;
        }
        positionals.push(argument);
    }
    if (positionals[1] !== 'upgrade' || positionals[positionals.length - 1] !== 'release') {
        return `the migration step runs '${positionals.join(' ')}', not the entry, upgrade and release (T-268)`;
    }
    return undefined;
};

/** A portal answer that is a page: `curl … | head -c 200 | grep -qi '<html\|<!doctype'`. */
export const pageAnswer = (body: string): boolean => /<html|<!doctype/i.test(body);

/** A login answer that carries a token, which is what says the released process reached a schema. */
export const tokenAnswer = (body: string): boolean => body.includes('access_token');

/**
 * Why a refused payload was not refused the way this run expects, or `undefined` when it was (F-437).
 *
 * A payload no model allows has to be answered as a **client** error: a 400 that carries the fields,
 * which is what a form can paint (`@@D-957`). Judging the sentence instead let a 500 through — the
 * gateway used to answer a schema failure as an unhandled error, so the run was green while the pod
 * logged a failure that meant nothing — and the words of a message are the part most likely to change.
 */
export const validationRefusal = ({
    status,
    body,
}: {
    status: number;
    body: string;
}): string | undefined => {
    if (status !== 400) return `the gateway answered ${status || 'nothing'}, not 400: ${body}`;
    if (!body.includes('gateway.validationFailed')) {
        return `the refusal is not typed as a validation failure: ${body}`;
    }
    if (!body.includes('must be boolean')) {
        return `the refusal does not name the field's type: ${body}`;
    }
    return undefined;
};

/**
 * The suite artifact must be named, one way or the other.
 *
 * A cluster run fetches it by URL and a run without egress reads a path, and a run with neither is a
 * mistake worth refusing before anything is created (exit code 2, a usage error).
 */
export const artifactSourceError = (source: {
    artifactUrl?: string;
    artifactPath?: string;
}): string | undefined =>
    source.artifactUrl || source.artifactPath
        ? undefined
        : 'set ARTIFACT_URL (cluster) or ARTIFACT_PATH (local dev) to the suite artifact';

/**
 * The switch a service is turned off by, as the CLI takes it.
 *
 * One spelling for one decision: the deployment's `services` switchboard travels to the CR, and a run
 * that generates its own tree passes it the same way the suite's own config would.
 */
export const serviceOffArguments = (service: string | undefined): string[] =>
    service ? [`--kustomize.deploy.services.${service}=false`] : [];

/**
 * A service the tenant brings, as the opt-in a declaration writes (`@@D-504`).
 *
 * The databases travel with it because a `k8s` plan cannot read them off the block that dials the
 * database — the connection lives under `release`, which a planning run does not merge — and a generated
 * MySQL with no schema is a workload that starts and refuses the first migration (`@@T-277`). The
 * credentials are the second opt-in for the same reason: a database whose users are created from its own
 * Secret is what a generated one needs (`@@D-509`).
 */
export const serviceOnArguments = (service: string | undefined, databases: string[]): string[] =>
    service
        ? [
              `--kustomize.deploy.services.${service}.credentials.generate=true`,
              ...databases.map(
                  database => `--kustomize.deploy.services.${service}.databases=${database}`,
              ),
          ]
        : [];

/**
 * The namespace a suite's generated workloads run in, read off the tree rather than declared.
 *
 * The tree carries one namespace file per namespace it uses, and the suite's own is excluded: whatever
 * is left is where the services went, which is why a run with none left has nothing to assert about
 * them. `kustomization` is kustomize's own generated file rather than a namespace.
 */
export const servicesNamespaceFromNames = (
    names: string[],
    suiteNamespace: string,
): string | undefined =>
    names
        .map(name => name.replace(/\.yaml$/, ''))
        .filter(name => name && name !== 'kustomization' && name !== suiteNamespace)[0];
