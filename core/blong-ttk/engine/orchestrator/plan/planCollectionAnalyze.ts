import {handler} from '@feasibleone/blong';
import type {IMeta} from '@feasibleone/blong';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

/**
 * Analyze a test collection without executing it.
 *
 * Provides visibility into:
 * - Test structure and hierarchy
 * - Step dependencies
 * - Expected parallelization
 * - Estimated execution graph
 *
 * Useful for understanding collection complexity before execution.
 *
 * @param collectionPath - Path to TypeScript collection file
 * @returns Collection metadata and dependency graph
 */
export default handler(() => ({
    async planCollectionAnalyze(
        {
            collectionPath,
        }: {
            collectionPath: string;
        },
        $meta: IMeta,
    ) {
        // Resolve path
        const absolutePath = resolve(collectionPath);

        // Read collection file
        const content = await readFile(absolutePath, 'utf-8');

        // Parse collection metadata
        const metadata = extractMetadata(content);

        // Analyze dependencies
        const dependencies = analyzeDependencies(content);

        // Estimate parallelization potential
        const parallelization = estimateParallelization(dependencies);

        return {
            path: absolutePath,
            metadata,
            dependencies,
            parallelization,
        };
    },
}));

/**
 * Extract collection metadata from source
 */
function extractMetadata(content: string) {
    const metadata: any = {
        handlers: [],
        imports: [],
        groups: [],
    };

    // Extract handler names (async function names)
    const handlerRegex = /async\s+function\s+(\w+)/g;
    let match;
    while ((match = handlerRegex.exec(content)) !== null) {
        metadata.handlers.push(match[1]);
    }

    // Extract imports
    const importRegex = /handler:\s*\{([^}]+)\}/g;
    while ((match = importRegex.exec(content)) !== null) {
        const imports = match[1]
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        metadata.imports.push(...imports);
    }

    // Extract group names
    const groupRegex = /group\(['"]([^'"]+)['"]\)/g;
    while ((match = groupRegex.exec(content)) !== null) {
        metadata.groups.push(match[1]);
    }

    return metadata;
}

/**
 * Analyze step dependencies
 */
function analyzeDependencies(content: string) {
    const dependencies: Record<string, string[]> = {};

    // Match function signatures
    const funcRegex = /async\s+function\s+(\w+)\s*\([^,]*,\s*\{([^}]*)\}/g;
    let match;

    while ((match = funcRegex.exec(content)) !== null) {
        const funcName = match[1];
        const params = match[2];

        // Extract parameter names (dependencies)
        const deps = params
            .split(',')
            .map(p => p.trim())
            .filter(p => p && !p.startsWith('$'));

        dependencies[funcName] = deps;
    }

    return dependencies;
}

/**
 * Estimate parallelization potential
 */
function estimateParallelization(dependencies: Record<string, string[]>) {
    const handlers = Object.keys(dependencies);
    const noDeps: string[] = [];
    const withDeps: string[] = [];

    for (const handler of handlers) {
        if (dependencies[handler].length === 0) {
            noDeps.push(handler);
        } else {
            withDeps.push(handler);
        }
    }

    // Calculate levels of parallelism
    const levels: string[][] = [];
    const processed = new Set<string>();

    // Level 0: no dependencies
    levels.push([...noDeps]);
    noDeps.forEach(h => processed.add(h));

    // Subsequent levels
    let remaining = [...withDeps];
    while (remaining.length > 0) {
        const nextLevel = remaining.filter(handler => {
            const deps = dependencies[handler];
            return deps.every(d => processed.has(d));
        });

        if (nextLevel.length === 0) {
            // Circular dependency or unknown dep
            levels.push(remaining);
            break;
        }

        levels.push(nextLevel);
        nextLevel.forEach(h => processed.add(h));
        remaining = remaining.filter(h => !nextLevel.includes(h));
    }

    return {
        totalHandlers: handlers.length,
        independentHandlers: noDeps.length,
        dependentHandlers: withDeps.length,
        levels: levels.length,
        parallelismPerLevel: levels.map(l => l.length),
        maxParallelism: Math.max(...levels.map(l => l.length)),
        graph: levels,
    };
}
