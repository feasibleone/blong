import type {ILayerConfig} from '@feasibleone/blong';
import merge from 'ut-function.merge';

/**
 * Compose the effective configuration for a self-contained layer.
 *
 * Configuration priority (highest to lowest):
 * 1. Parent/realm-level config (from server.ts or realm.ts)
 * 2. Environment-specific layer config (e.g. layer's config.dev)
 * 3. Layer's default config (layer's config.default)
 * 4. Framework defaults
 */
export function composeLayerConfig<T>(
    layerConfig: ILayerConfig<T> | undefined,
    parentConfig: Partial<T> | boolean | undefined,
    activeEnvs: string[],
): Partial<T> | boolean | undefined {
    if (!layerConfig?.config) return parentConfig;

    const defaultConfig = layerConfig.config.default ?? {};
    const envConfigs = activeEnvs
        .map(env => layerConfig.config[env])
        .filter((c): c is Partial<T> => c !== undefined && c !== null);

    const layerEffectiveConfig = merge({}, defaultConfig, ...envConfigs) as Partial<T>;

    if (typeof parentConfig === 'boolean') return parentConfig;
    if (parentConfig === undefined) return layerEffectiveConfig;

    return merge({}, layerEffectiveConfig, parentConfig) as Partial<T>;
}
