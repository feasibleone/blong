import type {Dirent} from 'fs';
import {readdir} from 'fs/promises';
import {extname, join} from 'path';
import {inferLayerType, type LayerType} from './layerTypeInference.ts';

export interface ILayerInfo {
    name: string;
    path: string;
    type: LayerType;
    kind: string;
    entryFile: string;
}

const LAYER_ENTRY_NAMES = ['adapter', 'orchestrator', 'gateway', 'error', 'test', 'eft', 'backend', 'component', 'browser'];
const CODE_EXTENSIONS = new Set(['.ts', '.js', '.mts', '.mjs']);

function isCode(filename: string): boolean {
    return CODE_EXTENSIONS.has(extname(filename));
}

/**
 * Scan a realm directory to discover all self-contained layer files.
 * Looks for:
 * - Direct layer files: adapter.ts, orchestrator.ts, gateway.ts, etc.
 * - Layer definition files inside layer folders: adapter/db.ts, orchestrator/dispatch.ts, etc.
 */
export async function discoverLayers(realmPath: string): Promise<ILayerInfo[]> {
    const layers: ILayerInfo[] = [];

    let entries: Dirent[];
    try {
        entries = await readdir(realmPath, {withFileTypes: true}) as Dirent[];
    } catch {
        return layers;
    }

    for (const entry of entries) {
        const name = entry.name.toString();
        const entryPath = join(realmPath, name);

        if (entry.isFile() && isCode(name)) {
            const baseName = name.slice(0, -extname(name).length);
            if (LAYER_ENTRY_NAMES.includes(baseName)) {
                layers.push({
                    name: baseName,
                    path: realmPath,
                    type: inferLayerType(baseName),
                    kind: baseName,
                    entryFile: entryPath,
                });
            }
        } else if (entry.isDirectory() && !name.startsWith('.') && name !== 'node_modules') {
            if (LAYER_ENTRY_NAMES.includes(name)) {
                let subEntries: Dirent[];
                try {
                    subEntries = await readdir(entryPath, {withFileTypes: true}) as Dirent[];
                } catch {
                    continue;
                }
                for (const subEntry of subEntries) {
                    const subName = subEntry.name.toString();
                    if (subEntry.isFile() && isCode(subName)) {
                        const subBaseName = subName.slice(0, -extname(subName).length);
                        layers.push({
                            name: `${name}/${subBaseName}`,
                            path: entryPath,
                            type: inferLayerType(name),
                            kind: name,
                            entryFile: join(entryPath, subName),
                        });
                    }
                }
            }
        }
    }

    return layers;
}
