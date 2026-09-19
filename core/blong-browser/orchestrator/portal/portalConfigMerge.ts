/**
 * `portalConfigMerge` — the portal configuration of the whole suite.
 *
 * The shell cannot ask `portalConfigGet` for this. A port resolves that name to a
 * single function — the newest group's — because the prototype chain that shadows
 * the earlier groups is deliberate: it is how a handler reaches its super. So the
 * portal group owns this second entry point, which asks *every* provider and
 * composes their answers: the model aggregator on behalf of each model-owning
 * realm, and each realm that answers `portalConfigGet` for its own hand-written
 * pages. `src/portalConfig.ts` holds the rule; this handler only finds the
 * providers.
 *
 * A realm contributes by exporting `portalConfigGet` exactly as before, so no
 * provider needs to know about this, and one that ships no pages contributes
 * nothing.
 */
import {handler} from '@feasibleone/blong';
import type {IMeta} from '@feasibleone/blong/types';
import {mergePortalConfigs} from '../../src/portalConfig.ts';
import type {IPortalConfig} from '../../src/types/portal.js';

/** The port, as far as this handler needs it: the providers of one method. */
type ProviderPort = {findHandlers?: (methodName: string) => unknown[]};

export default handler(
    () =>
        async function portalConfigMerge(
            params: Record<string, unknown>,
            $meta: IMeta,
        ): Promise<IPortalConfig> {
            const port = this as unknown as ProviderPort;
            const providers = port.findHandlers?.('portalConfigGet') ?? [];
            const answers = await Promise.all(
                providers.map(provider =>
                    (provider as (p: unknown, m?: IMeta) => unknown).call(
                        this,
                        params ?? {},
                        $meta,
                    ),
                ),
            );
            return mergePortalConfigs(answers as Array<Partial<IPortalConfig> | undefined | null>);
        },
);
