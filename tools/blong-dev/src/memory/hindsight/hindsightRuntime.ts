/**
 * The one place the rest of the CLI obtains a bank connection.
 *
 * `commands/memory.ts` needs a store in four places — the write hook, the forget
 * hook, the backfill and the search — and every one of them must behave
 * identically when the server is unreachable or the feature is switched off.
 * Routing them through one function is what makes that true, and it is also the
 * seam a command-layer test replaces so that no test touches the network.
 */

import {resolveHindsightConfig, type IHindsightConfig} from './hindsightConfig.ts';
import {createHindsightStore, type IHindsightStore} from './hindsightStore.ts';

/** A resolved bank: the settings to report, and the store, or `null` when off. */
export interface IResolvedHindsight {
    config: IHindsightConfig;
    store: IHindsightStore | null;
}

/** How a store is built; replaceable through {@link setHindsightStoreFactory}. */
export type StoreFactory = (config: IHindsightConfig) => IHindsightStore | null;

const defaultFactory: StoreFactory = config => createHindsightStore(config);

let factory: StoreFactory = defaultFactory;

/**
 * Resolve the settings and the store together.
 *
 * `store === null` means the feature is switched off, which is the signal for a
 * caller to do nothing at all — no warning, no attempt. Callers that need to
 * name the server in a message use the config returned alongside it.
 */
export function resolveHindsight(): IResolvedHindsight {
    const config = resolveHindsightConfig();
    return {config, store: factory(config)};
}

/** Replace the store factory (tests), or restore the real one with `null`. */
export function setHindsightStoreFactory(next: StoreFactory | null): void {
    factory = next ?? defaultFactory;
}
