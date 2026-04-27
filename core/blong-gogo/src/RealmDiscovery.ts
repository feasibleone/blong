import {access, readFile} from 'fs/promises';
import {dirname, join, parse} from 'path';

export interface IRealmInfo {
    realmPath: string;
    realmName: string;
    packageJson: {name: string; version: string; realm?: boolean; [key: string]: unknown};
}

const cache = new Map<string, IRealmInfo | null>();

/**
 * Traverse up from a layer file path to find the nearest package.json
 * that marks a realm boundary.
 *
 * A package.json is considered a realm boundary when it:
 * - Has a `"realm": true` marker, OR
 * - Is the first package.json found above the layer file
 *
 * @param layerPath - Absolute path to the layer file or directory
 */
export async function findRealm(layerPath: string): Promise<IRealmInfo | null> {
    const startDir = layerPath.endsWith('.ts') || layerPath.endsWith('.js')
        ? dirname(layerPath)
        : layerPath;

    if (cache.has(startDir)) return cache.get(startDir) ?? null;

    let current = startDir;
    while (true) {
        const parent = dirname(current);
        if (parent === current) break; // reached filesystem root

        const pkgPath = join(current, 'package.json');
        try {
            await access(pkgPath);
            const pkgJson = JSON.parse(await readFile(pkgPath, 'utf-8'));
            const result: IRealmInfo = {
                realmPath: current,
                realmName: pkgJson.name ?? parse(current).base,
                packageJson: pkgJson,
            };
            cache.set(startDir, result);
            return result;
        } catch {
            // No package.json here, continue up
        }
        current = parent;
    }

    cache.set(startDir, null);
    return null;
}

/** Clear the realm discovery cache (useful in watch mode). */
export function clearRealmCache(): void {
    cache.clear();
}
