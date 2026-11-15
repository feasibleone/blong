import {orchestrator} from '@feasibleone/blong';

import type {IComponentK8sContribution} from '@feasibleone/blong/types';

import type {IBlobConfig} from '../blob/blobConfig.ts';

/**
 * orchestrator/blobDispatch.ts — the realm's one served namespace.
 *
 * The orchestrator groups are namespaces rather than services: `blob.blob` holds store, read, find and
 * remove, `blob.upload` the session that streams a file in, `blob.temp` the sweep a deployment
 * schedules, `blob.storage` what the store in front of them can do, and `blob.scope` the cookie that decides
 * who may read it back. They all answer `blob.*`,
 * so one port serves them — a realm that split them would publish four Services for one file
 * (@@D-836).
 *
 * The imports are by suffix, so a group added beside these is picked up without a second declaration
 * and a folder that is not one of the three is not. Nothing is forwarded: this realm has no database
 * to fall back to (@@D-837), so a method the port does not hold is a method this realm does not have.
 */
/**
 * The port carries the realm's own settings, so its type is what `this.config` is read as: the key, the
 * ceilings, the cookie and the scope providers are declared once in `blob/blobConfig.ts` (`@@F-736`).
 */
export default orchestrator<IBlobConfig & IComponentK8sContribution>(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: 'blob',
            imports: [/blob\.(blob|temp|upload|scope|storage)$/],
        },
        /**
         * Development-time key material, committed on purpose and not a secret (`@@D-839`).
         *
         * The gateway's dev keys exist for the same reason: two processes started from the same checkout
         * have to agree, or a blob written by one is unreadable by the other — and a developer pressing
         * *dev* should not have to mint a key first. A deployment is given both by the operator, in the
         * suite's own secret document (`blob.blobDispatch.crypto.key` and `.cookie.secret`), which every
         * pod mounts as an rc file — one channel rather than an env pair beside it (`@@D-856`).
         */
        dev: {
            crypto: {key: '6b1f9c0d3a7e45b28f0c9d5a1e3b7c4f8a2d6e0b4c8f1a3d7e5b9c2f6a0d4e8b'},
            cookie: {secret: 'blong-blob-dev-cookie-secret'},
        },
    },
}));
