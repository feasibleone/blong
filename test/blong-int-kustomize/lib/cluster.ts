/**
 * scripts/lib/cluster.ts — what a step asks a k3d cluster to do.
 *
 * One function per question the runbook asks the cluster, in the vocabulary the cluster answers in:
 * create it, list its nodes, apply a tree, wait for what the tree started, read an object back. Each
 * takes its coordinates and the step's `{run, capture, log}` and nothing else, so the whole file is
 * what a realm adapter would bind to a process runner and what a handler would call.
 *
 * Two habits are kept deliberately. Every `kubectl` call names its namespace, because a runbook that
 * relies on the current context is a runbook that applies a suite to whoever ran it last. And the
 * waits are on conditions rather than on a duration — a rollout that is slow is not a rollout that
 * failed, and a runbook that sleeps is one that is either too slow or too short on the day it matters.
 */
import {createConnection} from 'node:net';

import {fail, waitFor, type IStepIo} from './exec.ts';

/**
 * Whether the cluster is there, asked without creating anything.
 *
 * `k3d cluster list` rather than a kubectl call, because the answer is needed before there is a
 * context to read.
 */
export const clusterExists = async (cluster: string, io: IStepIo): Promise<boolean> => {
    const listed = await io.capture('k3d', ['cluster', 'list', '--no-headers'], {
        allowFailure: true,
    });
    return listed
        .split('\n')
        .map(line => line.split(/\s+/)[0])
        .includes(cluster);
};

/**
 * Create the cluster, when the caller asked for one.
 *
 * `create` is required rather than defaulted, and the failure it produces is the point: this used to
 * create whatever it did not find, so a run that forgot `CLUSTER` answered by building a *second*
 * cluster beside the one that was running — and when the build then stalled, the run said nothing about
 * why (F-446). A suite's own CI job creates its cluster here, and it says so with `CREATE_CLUSTER=1`.
 *
 * The create has a timeout because k3d waits for nodes: a container left in `Created` by a wedged
 * runtime is not a slow cluster, it is a run that will never finish.
 */
export const clusterEnsure = async (
    {
        cluster,
        agents,
        create,
        timeoutMs = 300_000,
    }: {
        cluster: string;
        agents: number;
        /** Whether this run may create one; a run that may not, stops instead. */
        create: boolean;
        timeoutMs?: number;
    },
    io: IStepIo,
): Promise<void> => {
    if (await clusterExists(cluster, io)) {
        io.log(`cluster ${cluster} is already there`);
        return;
    }
    if (!create) {
        fail(
            `cluster ${cluster} is not there, and this run does not create one: ` +
                `create it, or pass CREATE_CLUSTER=1 to have this run do it`,
        );
    }
    // Two nodes on purpose: a single-node cluster cannot show that the read-only suite mount works
    // across nodes, which is the point of the volume model.
    await io.run('k3d', ['cluster', 'create', cluster, '--agents', `${agents}`, '--wait'], {
        timeoutMs,
    });
};

/** The nodes a k3d import loop has to reach: an image on one node is an image on that node only. */
export const nodeNames = async (io: IStepIo): Promise<string[]> => {
    const listed = await io.capture('kubectl', ['get', 'nodes', '-o', 'name']);
    const nodes = listed
        .split('\n')
        .map(line => line.replace(/^node\//, '').trim())
        .filter(Boolean);
    if (!nodes.length) fail('the cluster reports no nodes');
    return nodes;
};

/**
 * The namespace a Secret is about to be written into has to be there first.
 *
 * The tenant's namespace is created by the tree applied a moment later, and a Secret cannot be written
 * into one that does not exist yet — which is why this runs before the apply rather than instead of
 * it. Existence is asked first rather than tolerated afterwards: `kubectl create` on a name that is
 * there prints `AlreadyExists` to the run's stderr, which reads like a failure in a log that is
 * otherwise an assertion.
 *
 * `--save-config` because the tree applied a moment later carries the same Namespace: without the
 * annotation `kubectl apply` writes, that apply answers with a warning that it should only be used on
 * objects `kubectl create --save-config` or `kubectl apply` made — which is true, and is what the flag
 * makes true.
 */
export const namespaceEnsure = async (
    {namespace}: {namespace: string},
    io: IStepIo,
): Promise<void> => {
    const present = await io.capture('kubectl', ['get', 'namespace', namespace], {
        allowFailure: true,
    });
    if (present.length) return;
    await io.run('kubectl', ['create', 'namespace', namespace, '--save-config']);
};

export const applyTree = async ({tree}: {tree: string}, io: IStepIo): Promise<void> => {
    await io.run('kubectl', ['apply', '-k', tree]);
};

export const rolloutRestart = async (
    {namespace, resource}: {namespace: string; resource: string},
    io: IStepIo,
): Promise<void> => {
    await io.run('kubectl', ['-n', namespace, 'rollout', 'restart', resource], {
        // A namespace without the workload is the ordinary case: a suite tree carries no DaemonSet
        // when nothing needs one, and a caller that published nothing still refreshes what is there.
        allowFailure: true,
    });
};

export const rolloutStatus = async (
    {
        namespace,
        resource,
        timeoutSeconds = 300,
    }: {
        namespace: string;
        resource: string;
        timeoutSeconds?: number;
    },
    io: IStepIo,
): Promise<void> => {
    await io.run(
        'kubectl',
        ['-n', namespace, 'rollout', 'status', resource, `--timeout=${timeoutSeconds}s`],
        {allowFailure: true},
    );
};

/**
 * Every workload the tree started is up, and up *this* rollout.
 *
 * `kubectl wait` takes a condition and `kubectl rollout status` takes one resource, so the two are
 * used as they are: an Available Deployment may still be mid-rollout with the old pod and the new one
 * both running, and a report that called that converged would be wrong.
 */
export const waitForWorkloads = async (
    {namespace, timeoutSeconds = 300}: {namespace: string; timeoutSeconds?: number},
    io: IStepIo,
): Promise<void> => {
    await io.run(
        'kubectl',
        [
            '-n',
            namespace,
            'wait',
            '--for=condition=Available',
            'deployment',
            '--all',
            `--timeout=${timeoutSeconds}s`,
        ],
        {allowFailure: true},
    );
    const listed = await io.capture('kubectl', [
        '-n',
        namespace,
        'get',
        'deployment,daemonset',
        '-o',
        'name',
    ]);
    for (const resource of listed
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)) {
        await io.run(
            'kubectl',
            ['-n', namespace, 'rollout', 'status', resource, `--timeout=${timeoutSeconds}s`],
            {allowFailure: true},
        );
    }
};

/** One object read back, as JSON. The runbook asks the cluster rather than restating what it wrote. */
export const getJson = async <T>(
    {namespace, resource}: {namespace: string; resource: string},
    io: IStepIo,
): Promise<T | undefined> => {
    const body = await io.capture('kubectl', ['-n', namespace, 'get', resource, '-o', 'json'], {
        allowFailure: true,
    });
    try {
        return JSON.parse(body) as T;
    } catch {
        return undefined;
    }
};

/**
 * A field of one object, by jsonpath — the shape the shell runbook read its assertions out of.
 *
 * The resource is one word (`ingress/shop-test`, `service/db`): a name and its kind are two arguments,
 * and passing them as one string asks kubectl for a *type* called "ingress shop-test", which fails
 * silently enough that an assertion reads an empty field as a missing host. A read that fails is a
 * failure here unless the caller says the object may not be there at all.
 */
export const getField = async (
    {
        namespace,
        resource,
        jsonPath,
        optional = false,
    }: {
        namespace: string;
        /** `ingress/shop-test`, `service/db`, `endpoints/web-http`. */
        resource: string;
        jsonPath: string;
        optional?: boolean;
    },
    io: IStepIo,
): Promise<string> =>
    (
        await io.capture(
            'kubectl',
            ['-n', namespace, 'get', resource, '-o', `jsonpath=${jsonPath}`],
            {allowFailure: optional},
        )
    ).trim();

export const objectExists = async (
    {namespace, resource}: {namespace: string; resource: string},
    io: IStepIo,
): Promise<boolean> =>
    (await io.capture('kubectl', ['-n', namespace, 'get', resource], {allowFailure: true})).length >
    0;

/** The first pod a selector names — the one a probe runs from, without naming a replica. */
export const podName = async (
    {namespace, selector}: {namespace: string; selector: string},
    io: IStepIo,
): Promise<string | undefined> => {
    const listed = await io.capture(
        'kubectl',
        ['-n', namespace, 'get', 'pods', '-l', selector, '-o', 'name'],
        {allowFailure: true},
    );
    return listed
        .split('\n')
        .map(line => line.replace(/^pod\//, '').trim())
        .filter(Boolean)[0];
};

/**
 * A pod whose containers are all ready, which is not the same thing as a pod that is Running.
 *
 * A container in a crash loop leaves its pod `Running` with nothing to exec into, so a probe that
 * chose by phase would skip itself on exactly the cluster that needs it (F-441). The readiness column
 * is read instead, and a cache pod is excluded because it holds no application code.
 */
export const readyPodName = async (
    {namespace, exclude = /^cache-/}: {namespace: string; exclude?: RegExp},
    io: IStepIo,
): Promise<string | undefined> => {
    const listed = await io.capture(
        'kubectl',
        [
            '-n',
            namespace,
            'get',
            'pods',
            '--field-selector=status.phase=Running',
            '-o',
            'custom-columns=NAME:.metadata.name,READY:.status.containerStatuses[*].ready',
            '--no-headers',
        ],
        {allowFailure: true},
    );
    return listed
        .split('\n')
        .map(line => line.trim().split(/\s+/))
        .filter(([name, ready]) => name && ready?.includes('true') && !exclude.test(name))
        .map(([name]) => name as string)[0];
};

export const execInPod = async (
    {
        namespace,
        pod,
        command,
        container,
        allowFailure = false,
    }: {
        namespace: string;
        pod: string;
        container?: string;
        command: string[];
        /** A probe that answers yes or no is allowed to answer no; a dial is not. */
        allowFailure?: boolean;
    },
    io: IStepIo,
): Promise<void> => {
    // Named when the caller knows it: a pod that carries an init container makes `kubectl exec` answer
    // with the container it defaulted to, which is one more line in a log that is otherwise an
    // assertion.
    const args = ['-n', namespace, 'exec', pod];
    if (container) args.push('-c', container);
    await io.run('kubectl', [...args, '--', ...command], {allowFailure});
};

/** Whether the pod can run the probe at all, asked by running the thing the probe needs (F-441). */
export const podHasNode = async (
    {namespace, pod}: {namespace: string; pod: string},
    io: IStepIo,
): Promise<boolean> =>
    (
        await io.capture('kubectl', ['-n', namespace, 'exec', pod, '--', 'node', '--version'], {
            allowFailure: true,
        })
    ).length > 0;

/** A TCP connect, which is the whole of "did it start answering". */
export const portAnswers = (port: number, host = '127.0.0.1'): Promise<boolean> =>
    new Promise(resolve => {
        const socket = createConnection({port, host});
        const done = (answer: boolean) => {
            socket.destroy();
            resolve(answer);
        };
        socket.on('connect', () => done(true));
        socket.on('error', () => done(false));
        socket.setTimeout(1000, () => done(false));
    });

export interface IPortForward {
    localPort: number;
    stop: () => void;
}

/**
 * Reach a Service from the machine, without an ingress controller or DNS.
 *
 * Serving a host needs an ingress controller and a bare k3d cluster has none, so the portal's content
 * is checked through one port-forward — which is what a reader without DNS would do anyway. The
 * forward is ready when the local port answers, not after a fixed wait: a sleep is either slower than
 * the forward or shorter than it.
 *
 * A handler would not do this at all — it would call the Service's own address from inside the
 * cluster — and it is kept in this shape because it is what a runbook has to do from outside.
 */
export const portForward = async (
    {
        namespace,
        service,
        localPort,
        remotePort = 8080,
    }: {
        namespace: string;
        service: string;
        localPort: number;
        remotePort?: number;
    },
    io: IStepIo,
): Promise<IPortForward> => {
    const {spawn} = await import('node:child_process');
    const child = spawn(
        'kubectl',
        ['-n', namespace, 'port-forward', `service/${service}`, `${localPort}:${remotePort}`],
        {stdio: 'ignore'},
    );
    const stop = () => {
        child.kill('SIGTERM');
    };
    try {
        await waitFor(`the port-forward to ${service}`, () => portAnswers(localPort), {
            timeoutMs: 15_000,
            intervalMs: 250,
        });
    } catch (error) {
        stop();
        throw error;
    }
    io.log(`port-forward service/${service} is answering on ${localPort}`);
    return {localPort, stop};
};
