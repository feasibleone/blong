#!/usr/bin/env -S node --input-type=module
/**
 * Migration tool: converts centralized server.ts layer config to self-contained layer files.
 *
 * Usage:
 *   node migrate-layers.ts <realm-server-ts-path>
 *   e.g. node migrate-layers.ts core/test/demo/server.ts
 *
 * What it does:
 *   1. Parses the realm's server.ts to extract per-layer config from config.default, config.dev, etc.
 *   2. For each layer file found in child folders, injects the config into the layer's adapter()/orchestrator() call
 *   3. Removes injected keys from server.ts, leaving only activation config
 *   4. Creates .bak backup files before modifying anything
 */

import {readFile, writeFile, readdir, access} from 'fs/promises';
import type {Dirent} from 'fs';
import {basename, dirname, extname, join, resolve} from 'path';

const LAYER_KINDS = new Set(['adapter', 'orchestrator']);
const ACTIVATION_KEYS = new Set(['error', 'adapter', 'orchestrator', 'gateway', 'test', 'eft', 'backend', 'component', 'browser']);

async function readSource(filePath: string): Promise<string> {
    return readFile(filePath, 'utf-8');
}

async function backup(filePath: string): Promise<void> {
    const src = await readSource(filePath);
    await writeFile(filePath + '.bak', src, 'utf-8');
}

function extractLayerConfigs(source: string): Map<string, Record<string, string>> {
    const configs = new Map<string, Record<string, string>>();

    // Find config blocks like: default: { layerName: { ... } }
    // We use a simple regex+manual brace matching approach
    const envMatch = source.match(/config:\s*\{([\s\S]*)\}\s*,?\s*\}\s*\)\s*;?\s*$/);
    if (!envMatch) return configs;

    // Extract all envs and their content
    const configBody = envMatch[1];

    // Match env keys: default:, dev:, microservice:, etc.
    const envPattern = /(\w+):\s*\{/g;
    let match: RegExpExecArray | null;
    const envOffsets: Array<{name: string; start: number}> = [];

    while ((match = envPattern.exec(configBody)) !== null) {
        envOffsets.push({name: match[1], start: match.index + match[0].length - 1});
    }

    for (let i = 0; i < envOffsets.length; i++) {
        const env = envOffsets[i];
        const end = findMatchingBrace(configBody, env.start);
        if (end === -1) continue;
        const envContent = configBody.slice(env.start + 1, end);

        // Now extract layer keys within this env
        const layerPattern = /(\w+):\s*(\{)/g;
        let lm: RegExpExecArray | null;
        while ((lm = layerPattern.exec(envContent)) !== null) {
            const layerName = lm[1];
            if (ACTIVATION_KEYS.has(layerName)) continue; // skip activation booleans/objects

            const layerStart = lm.index + lm[0].length - 1;
            const layerEnd = findMatchingBrace(envContent, layerStart);
            if (layerEnd === -1) continue;

            const layerConfig = envContent.slice(layerStart, layerEnd + 1);
            if (!configs.has(layerName)) configs.set(layerName, {});
            configs.get(layerName)![env.name] = layerConfig; // raw string for now
        }
    }

    return configs;
}

function findMatchingBrace(source: string, openPos: number): number {
    let depth = 0;
    for (let i = openPos; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

function injectConfigIntoLayer(source: string, layerName: string, envConfigs: Record<string, string>): string {
    // Find the adapter/orchestrator call and inject config
    const pattern = /export default (adapter|orchestrator)\s*\(\s*(?:\w+\s*=>\s*)?\(\s*\{([\s\S]*?)\}\s*\)\s*\)/;
    const match = source.match(pattern);
    if (!match) {
        // Simple fallback: replace `() => ({` with `blong => ({`
        return source
            .replace(/\(\s*\)\s*=>\s*\(\s*\{/, 'blong => ({')
            .replace(/\}\s*\)\s*\)(\s*;?\s*)$/, (_, tail) => {
                const configStr = buildConfigString(envConfigs);
                return `,\n${configStr}\n}))\n${tail}`;
            });
    }
    return source;
}

function buildConfigString(envConfigs: Record<string, string>): string {
    const entries = Object.entries(envConfigs);
    if (entries.length === 0) return '';

    const lines = entries.map(([env, body]) => `        ${env}: ${body},`).join('\n');
    return `    config: {\n${lines}\n    }`;
}

function removeLayerConfigsFromServer(source: string, layerNames: string[]): string {
    let result = source;
    for (const name of layerNames) {
        // Remove `name: { ... },` from any config env block
        // Match: optionally preceded by whitespace, key: { ... }, on its own "line"
        const pattern = new RegExp(`(\\s+)${name}:\\s*\\{[^}]*(?:\\{[^}]*\\}[^}]*)*\\}\\s*,?`, 'g');
        result = result.replace(pattern, '');
    }
    // Clean up empty env blocks left behind: `default: {},`
    result = result.replace(/(\w+):\s*\{\s*\},/g, '$1: {},');
    return result;
}

async function findLayerFile(folderPath: string, layerName: string): Promise<string | null> {
    // Look for layerName.ts inside any child folder (adapter/, orchestrator/, etc.)
    let entries: Dirent[];
    try {
        entries = await readdir(folderPath, {withFileTypes: true}) as Dirent[];
    } catch {
        return null;
    }

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dirName = entry.name.toString();
        const subPath = join(folderPath, dirName);
        let subEntries: Dirent[];
        try {
            subEntries = await readdir(subPath, {withFileTypes: true}) as Dirent[];
        } catch {
            continue;
        }
        for (const sub of subEntries) {
            if (sub.isFile()) {
                const subName = sub.name.toString();
                const base = subName.slice(0, -extname(subName).length);
                if (base === layerName) return join(subPath, subName);
            }
        }
    }
    return null;
}

async function migrate(serverTsPath: string): Promise<void> {
    const absPath = resolve(serverTsPath);
    const realmDir = dirname(absPath);

    console.log(`\nMigrating realm: ${absPath}`);

    const source = await readSource(absPath);
    const layerConfigs = extractLayerConfigs(source);

    if (layerConfigs.size === 0) {
        console.log('  No per-layer configs found. Nothing to migrate.');
        return;
    }

    const migrated: string[] = [];
    for (const [layerName, envConfigs] of layerConfigs) {
        const layerFile = await findLayerFile(realmDir, layerName);
        if (!layerFile) {
            console.log(`  ⚠ Layer file for "${layerName}" not found — skipping`);
            continue;
        }

        console.log(`  → Migrating "${layerName}" config to ${layerFile.replace(realmDir + '/', '')}`);
        const layerSource = await readSource(layerFile);
        await backup(layerFile);

        const updated = injectConfigIntoLayer(layerSource, layerName, envConfigs);
        await writeFile(layerFile, updated, 'utf-8');
        migrated.push(layerName);
    }

    if (migrated.length > 0) {
        await backup(absPath);
        const updatedServer = removeLayerConfigsFromServer(source, migrated);
        await writeFile(absPath, updatedServer, 'utf-8');
        console.log(`  ✓ Removed migrated configs from server.ts`);
    }

    console.log(`\nDone. Migrated: ${migrated.join(', ') || 'none'}`);
    console.log('Backup files created with .bak extension.');
}

const [,, serverTsArg] = process.argv;
if (!serverTsArg) {
    console.error('Usage: migrate-layers.ts <path/to/realm/server.ts>');
    process.exit(1);
}

migrate(serverTsArg).catch(err => {
    console.error(err);
    process.exit(1);
});
