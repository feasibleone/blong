/**
 * Activation config evaluation for self-contained layers.
 *
 * Layers can declare their own activation requirements, allowing
 * the framework to selectively load layers based on the current environment.
 */

export type ActivationValue =
    | boolean
    | ((env: string) => boolean)
    | Record<string, boolean>;

/**
 * Evaluate whether a layer should be activated for the given environments.
 *
 * @param activation - The activation config from the layer definition
 * @param activeEnvs - The list of active environment names (e.g. ['dev', 'microservice'])
 * @returns true if the layer should be activated
 */
export function evaluateActivation(
    activation: ActivationValue | undefined,
    activeEnvs: string[],
): boolean {
    if (activation === undefined || activation === true) return true;
    if (activation === false) return false;

    if (typeof activation === 'function') {
        return activeEnvs.some(env => activation(env));
    }

    if (typeof activation === 'object') {
        // Check if any of the active environments is enabled
        for (const env of activeEnvs) {
            if (activation[env] === true) return true;
            if (activation[env] === false) return false;
        }
        // Default to true if not explicitly configured for any active env
        return activation.default !== false;
    }

    return true;
}
