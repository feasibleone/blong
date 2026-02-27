/**
 * Maps well-known layer names to their server/browser type.
 * Layers with well-known names are automatically assigned a type.
 * Custom layer names require explicit type declaration.
 */

const SERVER_LAYER_NAMES = new Set([
    'adapter',
    'orchestrator',
    'gateway',
    'error',
    'test',
    'eft',
]);

const BROWSER_LAYER_NAMES = new Set([
    'backend',
    'component',
    'browser',
]);

export type LayerType = 'server' | 'browser' | 'unknown';

/**
 * Infer whether a layer is server-side or browser-side from its name.
 * Returns 'unknown' for custom layer names that don't match well-known names.
 */
export function inferLayerType(layerName: string): LayerType {
    if (SERVER_LAYER_NAMES.has(layerName)) return 'server';
    if (BROWSER_LAYER_NAMES.has(layerName)) return 'browser';
    return 'unknown';
}

export const serverLayerNames = SERVER_LAYER_NAMES;
export const browserLayerNames = BROWSER_LAYER_NAMES;
