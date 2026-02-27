/**
 * Layer dependency resolution via topological sort.
 *
 * Resolves the initialization order for layers based on their declared
 * dependencies (imports). Detects circular dependencies.
 */

export interface ILayerDep {
    name: string;
    imports?: string[];
}

export interface IDependencyResult {
    order: string[];
    circular?: string[][];
}

/**
 * Topologically sort layers by their dependencies.
 * Returns the initialization order (dependencies first).
 * Detects and reports circular dependencies.
 */
export function resolveDependencies(layers: ILayerDep[]): IDependencyResult {
    const nameSet = new Set(layers.map(l => l.name));
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const order: string[] = [];
    const circular: string[][] = [];

    const deps = new Map(layers.map(l => [l.name, (l.imports ?? []).filter(dep => nameSet.has(dep))]));

    function visit(name: string, stack: string[]): void {
        if (visited.has(name)) return;
        if (inStack.has(name)) {
            const cycleStart = stack.indexOf(name);
            circular.push(stack.slice(cycleStart).concat(name));
            return;
        }

        inStack.add(name);
        const layerDeps = deps.get(name) ?? [];
        for (const dep of layerDeps) {
            visit(dep, [...stack, name]);
        }
        inStack.delete(name);
        visited.add(name);
        order.push(name);
    }

    for (const layer of layers) {
        visit(layer.name, []);
    }

    return {order, ...(circular.length ? {circular} : {})};
}
