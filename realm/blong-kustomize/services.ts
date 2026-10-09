import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Type, type Static} from 'typebox';
import {Value} from 'typebox/value';
import {parse} from 'yaml';

/**
 * services.ts — the third-party services a deployment brings with it (Phase 15 I).
 *
 * A realm names an *abstract* service in its config (`db`, `s3`, the issuer of its identity provider)
 * and never a host, so a suite declares its `externalServices` today and points each at something
 * somebody else installed — the integration matrix's `mysql.blong-integration.svc.cluster.local`, in
 * the dev cluster's case. This module is the other half: one descriptor per service under `services/`,
 * saying what the service *is* and which adapters imply it, so that a deployment can generate the
 * workload itself and publish the alias its own config already uses.
 *
 * Three decisions are the module's, and they are what the plan's items ask for:
 *
 *   - **A descriptor is data, validated at load.** The file is the deployment's, not this realm's: a
 *     service is added by adding a file, and a file this code cannot mean is refused where it is read
 *     rather than half-applied to a cluster. `additionalProperties: false` is what makes a typo a
 *     failure (`kinds` spelled `kind` would otherwise generate nothing and say nothing).
 *   - **The adapters imply the service, the deployment may switch it off.** What a plan *needs* is a
 *     function of the adapter kinds its deployments activate, so the rule cannot drift from the
 *     deployment: a suite that activates `knex` needs a database. A deployment that points at an
 *     installation of its own switches the service off; a deployment that switches one *on* for an
 *     adapter it does not activate is refused, because the workload would be something nothing dials.
 *   - **The alias is the statement, not the host.** A realm's config keeps naming `mysql`, and the
 *     `ExternalName` Service that makes that name resolvable is generated beside the workload — which
 *     is what lets the workload move namespace without a configuration change anywhere.
 *
 * The objects themselves (the init ConfigMap, the claim, the Deployment, the Service) are not here:
 * they are a base beside each descriptor, which the generator copies into the emitted tree and renders
 * with the values this module resolves.
 */

/** A value a base may read out of a descriptor: one scalar, because a template cannot mean a tree. */
const scalar = Type.Union([Type.String(), Type.Number(), Type.Boolean()]);

/**
 * What one service *is*, as one YAML file under `services/` says it.
 *
 * The shape is closed (`additionalProperties: false`) for the reason the module's header gives: a
 * descriptor is data a deployment writes, and a field nothing reads is a field nobody notices is
 * misspelled.
 */
export const serviceDescriptor = Type.Object(
    {
        name: Type.String({minLength: 1}),
        /** The adapter kinds that imply it — the framework's own vocabulary, not this realm's. */
        kinds: Type.Array(Type.String({minLength: 1}), {minItems: 1}),
        image: Type.String({minLength: 1}),
        /** The port the service answers on, and the name that port carries in its Service. */
        port: Type.Object({name: Type.String({minLength: 1}), port: Type.Number()}),
        /** Absent for a service whose data is throwaway; a deployment may still ask for a claim. */
        storage: Type.Optional(
            Type.Object({
                size: Type.String({minLength: 1}),
                mountPath: Type.String({minLength: 1}),
                accessMode: Type.Optional(Type.String()),
            }),
        ),
        credentials: Type.Optional(
            Type.Object({
                secret: Type.String({minLength: 1}),
                keys: Type.Array(Type.String({minLength: 1}), {minItems: 1}),
            }),
        ),
        /** What the base needs beyond the values every service shares. */
        values: Type.Optional(Type.Record(Type.String(), scalar)),
    },
    {additionalProperties: false},
);

export type IServiceDescriptor = Static<typeof serviceDescriptor>;

/** The namespace the workloads run in unless a deployment names another. */
export const DEFAULT_SERVICES_NAMESPACE = 'blong-services';

/**
 * Where a generated workload may be scheduled, when a bare cluster is not enough.
 *
 * The shapes are Kubernetes', passed through verbatim: this realm puts a workload where the
 * deployment says, and reading the meaning of a toleration is the cluster's job, not a realm's. The
 * bases ship no placement, so on a bare cluster the scheduler decides — only a deployment whose nodes
 * are labelled knows to say otherwise.
 */
export interface IServicePlacement {
    nodeSelector?: Record<string, string>;
    tolerations?: Array<Record<string, unknown>>;
    affinity?: Record<string, unknown>;
}

/** What a deployment may say about one service: off, or a value of its own. */
export interface IServiceOverride {
    image?: string;
    storage?: {size?: string; storageClassName?: string};
    /** A Secret the deployment already owns, instead of one generated from the descriptor. */
    credentials?: {secret?: string};
    /** Where the workload may run: the pod spec is the only place these belong. */
    placement?: IServicePlacement;
    /**
     * The script this service is initialised by, supplied verbatim.
     *
     * A deployment that needs a realm of its own — an identity provider's clients, roles and users —
     * knows what they are and this realm does not, so the script travels as text rather than as a
     * shape this realm would have to model. It is written into the service's init object exactly as it
     * arrives: no `${db}` expansion, because a deployment's script is not a template (D-466).
     */
    init?: {script?: string};
    /**
     * The databases this deployment dials, for a service that has to create them.
     *
     * Named here when the plan cannot read them: a connection a `release` block carries is not in
     * the config a `k8s` planning run merges, so a suite that names its database only where it
     * dials it would otherwise ask its generated service for nothing and find none of them (T-277).
     * What the connections *do* name is merged with this list rather than replaced by it.
     */
    databases?: string[];
}

/** The deployment's own switchboard, keyed by service name. */
export type IServiceConfig = Record<string, boolean | IServiceOverride | undefined>;

/**
 * What a deployment asked for about the services it brings, as it asked.
 *
 * The three options travel together because they are one decision: a switch the operator has to reach
 * again (`backingServiceRequest`), the namespace the workloads run in, and the class their claims
 * ask for. A resolved service cannot say any of it back — an image an override pinned and one the
 * descriptor names look the same once applied — so the request is what the CR carries: the operator
 * regenerates the tree from that declaration, and a switch it cannot carry is a service that comes
 * back on the next pass.
 */
export interface IBackingServiceRequest {
    services?: IServiceConfig;
    servicesNamespace?: string;
    storageClassName?: string;
}

/**
 * A service the plan needs, with the values the plan supplies to its base.
 *
 * `databases` is the plan's own list: the names its connections carry are the names that have to exist
 * in the service, and asking the service for them is what makes `upgrade` able to create a schema.
 */
export interface IBackingService extends IServiceDescriptor {
    /** The namespace the workload lives in. */
    namespace: string;
    /** The databases the plan asks for, in the order its connections named them. */
    databases: string[];
    /** The class its claim asks for, when the deployment named one. */
    storageClassName?: string;
    /** The name the workload reads its credentials from — its own, or the one a deployment named. */
    credentialsSecret?: string;
    /**
     * True when the values behind {@link credentialsSecret} are the tree's own.
     *
     * The distinction decides whether a copy is written for the deployment that dials the service:
     * a Secret this realm generates is one it can write twice, and one a deployment owns is theirs to
     * place (D-462).
     */
    credentialsGenerated?: boolean;
    /** Where the workload may run, when the deployment named a place. */
    placement?: IServicePlacement;
    /**
     * The init script a deployment supplied, which is used instead of the descriptor's template.
     *
     * Carried separately from the descriptor's own `initScript` because the two are different things:
     * a descriptor's script is this realm's template for one image (one line per database the plan
     * names), while a deployment's is the text of the step it needs and is not expanded at all.
     */
    deploymentInitScript?: string;
}

export interface IServiceResolutionRequest {
    /** The adapter kinds the plan's deployments activate. */
    kinds: string[];
    /** The databases the connections name. */
    databases?: string[];
    /** The deployment's own switch and overrides. */
    config?: IServiceConfig;
    namespace?: string;
    storageClassName?: string;
}

export interface IServiceResolution {
    services: IBackingService[];
    /** What an activated adapter implies and the deployment switched off. */
    disabled: string[];
}

/** Where the descriptors live: the realm's own package, which the artifact carries with it. */
export const catalogDirectory = (): string =>
    fileURLToPath(new URL('./services/', import.meta.url));

/** Read once per directory: a plan is built per reconcile pass, and the files do not change. */
const loaded = new Map<string, IServiceDescriptor[]>();

/**
 * The catalog, read and validated.
 *
 * A descriptor that fails its schema, or a pair of files naming one service, throws with the file it
 * came from: the alternative is a tree missing a workload, which is a deployment that starts pods that
 * cannot reach what they were built to talk to.
 */
export const loadServiceCatalog = (dir = catalogDirectory()): IServiceDescriptor[] => {
    const cached = loaded.get(dir);
    if (cached) return cached;
    const catalog = readdirSync(dir)
        .filter(file => file.endsWith('.yaml'))
        .sort()
        .map(file => readDescriptor(join(dir, file)));
    const names = new Set<string>();
    for (const descriptor of catalog) {
        if (names.has(descriptor.name))
            throw new Error(`${dir}: two descriptors name the service '${descriptor.name}'`);
        names.add(descriptor.name);
    }
    loaded.set(dir, catalog);
    return catalog;
};

/** One file, or the failure that says which field of it this code cannot mean. */
const readDescriptor = (file: string): IServiceDescriptor => {
    const parsed: unknown = parse(readFileSync(file, 'utf8'));
    if (!Value.Check(serviceDescriptor, parsed)) {
        const [first] = [...Value.Errors(serviceDescriptor, parsed)];
        throw new Error(
            `${file}: ${first?.instancePath || '/'} ${first?.message ?? 'is not a service descriptor'}`,
        );
    }
    return parsed as IServiceDescriptor;
};

/**
 * Which services a plan needs, and what their bases are given.
 *
 * The implied set is read from the adapter kinds the plan's ports carry, so adding an adapter to a
 * deployment adds its service without anybody remembering to; `config` may switch one off (a
 * deployment that points at an installation of its own) and may name values of its own for one that
 * stays on. Switching one *on* is only legitimate for a service some activated adapter implies —
 * otherwise the workload would be one nothing dials, and its alias a name no configuration resolves.
 */
export const resolveBackingServices = (
    catalog: IServiceDescriptor[],
    request: IServiceResolutionRequest,
): IServiceResolution => {
    const config = request.config ?? {};
    const implied = catalog.filter(descriptor =>
        descriptor.kinds.some(kind => request.kinds.includes(kind)),
    );
    for (const [name, value] of Object.entries(config)) {
        if (value === false || value === undefined) continue;
        const descriptor = catalog.find(entry => entry.name === name);
        if (!descriptor)
            throw new Error(`services.${name}: no descriptor under services/ names that service`);
        if (!implied.includes(descriptor))
            throw new Error(
                `services.${name}: switched on, but no activated adapter kind implies it ` +
                    `(its descriptor serves ${descriptor.kinds.join(', ')})`,
            );
    }
    return {
        services: implied
            .filter(descriptor => config[descriptor.name] !== false)
            .map(descriptor => applied(descriptor, config[descriptor.name], request)),
        disabled: implied.filter(descriptor => config[descriptor.name] === false).map(d => d.name),
    };
};

/** A descriptor with the deployment's overrides and the plan's own values resolved into it. */
const applied = (
    descriptor: IServiceDescriptor,
    override: boolean | IServiceOverride | undefined,
    request: IServiceResolutionRequest,
): IBackingService => {
    const named = typeof override === 'object' ? override : undefined;
    return {
        ...descriptor,
        image: named?.image ?? descriptor.image,
        // A claim is only resolved for a service that declares storage: a class without a claim is a
        // configuration that reads as if it did something.
        ...(descriptor.storage
            ? {
                  storage: {
                      ...descriptor.storage,
                      size: named?.storage?.size ?? descriptor.storage.size,
                  },
                  storageClassName: named?.storage?.storageClassName ?? request.storageClassName,
              }
            : {}),
        // A deployment that already owns a Secret names it, and then nothing generated has to be
        // written — the workload's reference is the same either way, which is what keeps a generated
        // database and a hand-installed one one shape.
        ...(descriptor.credentials
            ? {
                  credentialsSecret: named?.credentials?.secret ?? `${descriptor.name}-credentials`,
                  credentialsGenerated: named?.credentials?.secret === undefined,
              }
            : {}),
        namespace: request.namespace ?? DEFAULT_SERVICES_NAMESPACE,
        // The connections first, then what the deployment named: deduplicated, because a name in both
        // places is one database and the init script creates it once.
        databases: [...new Set([...(request.databases ?? []), ...(named?.databases ?? [])])],
        // Carried, not interpreted: a placement reaches the pod spec by way of the plan, so whichever
        // pass renders the tree is the one that has to know where the workload may run.
        ...(named?.placement ? {placement: named.placement} : {}),
        // And the same for the init script: what a deployment writes is the step it needs, and the
        // generator writes it where the service's own base cannot — as text, unchanged.
        ...(named?.init?.script !== undefined ? {deploymentInitScript: named.init.script} : {}),
    };
};

/**
 * The aliases a generated set publishes, in the shape a plan's `externalServices` takes.
 *
 * One per service, named after the service, pointing at the workload's own Service: the deployment's
 * configuration keeps saying `mysql`, and this is what makes that name answer from the suite's
 * namespace.
 */
export const externalServicesOf = (
    services: IBackingService[],
): Record<string, {externalName: string; ports: {name: string; port: number}[]}> =>
    Object.fromEntries(
        services.map(service => [
            service.name,
            {
                externalName: `${service.name}.${service.namespace}.svc.cluster.local`,
                ports: [{name: service.port.name, port: service.port.port}],
            },
        ]),
    );
