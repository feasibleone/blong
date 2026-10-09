/**
 * scripts/lib/keys.ts — the gateway key pair a namespace shares, written before the pods that read it.
 *
 * The operator would create it on its own reconcile pass, but its own pod serves the deployment UI
 * from its first start, and a tenant's Deployments applied a moment before that pass would run on the
 * framework's per-process fallback until they restarted. Hence: the machine that applies the tree
 * makes the pair first (T-252).
 *
 * The realm already answers this as a command — `bin/kustomize.ts keys-ensure` — and this file is the
 * two things around it: the pod that has to be *gone* before the pair is renewed, and the wait for the
 * rollout that would otherwise write the shape it knows back over it.
 */
import {getField, namespaceEnsure, objectExists} from './cluster.ts';
import type {IStepIo} from './exec.ts';

/**
 * Make sure a namespace has a usable pair.
 *
 * The namespace is made first, because a Secret cannot be written into one that is not there yet: on a
 * cluster that has never seen this suite, the operator's own namespace is created by the install tree
 * applied a moment *after* this write, and the order is deliberate — the pair has to be there before
 * the pods that read it. The tree carries that Namespace too, so the create is the same object
 * arriving a moment early (F-448).
 *
 * A Secret under this name that holds no rc document was written by an earlier revision of this realm
 * — the pair used to travel as two variables, and a pod mounting it now would read nothing — so it is
 * removed and made again. Only the name and the shape decide: a Secret somebody owns under this name
 * and in this shape is never touched.
 */
export const keysEnsure = async (
    {root, namespace}: {root: string; namespace: string},
    io: IStepIo,
): Promise<void> => {
    await namespaceEnsure({namespace}, io);
    const resource = 'secret/gateway-keys';
    const present = await objectExists({namespace, resource}, io);
    if (present) {
        const config = await getField({namespace, resource, jsonPath: '{.data.config}'}, io);
        if (!config) {
            await io.run('kubectl', ['-n', namespace, 'delete', 'secret', 'gateway-keys']);
        }
    }
    await io.run(
        'node',
        [
            '--conditions=development',
            `${root}/realm/blong-kustomize/bin/kustomize.ts`,
            'keys-ensure',
            `--namespace=${namespace}`,
        ],
        {cwd: `${root}/realm/blong-kustomize`},
    );
};

/**
 * Renew a namespace that an older operator is still reconciling.
 *
 * The pair is written, the install is applied, the rollout is waited for, and the pair is written
 * again: an operator pod from the previous revision keeps reconciling until it is gone, and it would
 * write the shape it knows back over the pair the first call just renewed. The wait goes between the
 * two writes rather than before them, which is what makes the second write land last (T-278).
 */
export const keysEnsureAroundRollout = async (
    {root, namespace, rollout}: {root: string; namespace: string; rollout: () => Promise<void>},
    io: IStepIo,
): Promise<void> => {
    await keysEnsure({root, namespace}, io);
    await rollout();
    await keysEnsure({root, namespace}, io);
};
