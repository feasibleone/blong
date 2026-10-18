/**
 * Resolve a V8 stack position through a source map registered by the browser build @@D-583.
 *
 * The executor stays synchronous: the map is registered when the test module evaluates, so a
 * lookup here is a table walk rather than a fetch. The server platform has no registry.
 */

/** The subset of a source map the resolver needs. */
export interface IRegisteredSourceMap {
    version: number;
    sources?: string[];
    sourceRoot?: string;
    names?: string[];
    mappings: string;
}

type SourceMapRegistry = Record<string, IRegisteredSourceMap>;

/** Global the Vite plugin writes; same name in `sourceMapRegister.ts`. */
const REGISTRY = '__BLONG_SOURCE_MAPS__';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

interface IPosition {
    line: number;
    column: number;
}

/**
 * Map `line`/`column` (both 1-based, as V8 reports them) through the source map registered for
 * `file`. Returns the input unchanged when no map is available.
 */
export function mapSourcePosition(file: string, line: number, column: number): IPosition {
    const registry = (globalThis as {[REGISTRY]?: SourceMapRegistry})[REGISTRY];
    if (!registry) return {line, column};
    const map = lookup(registry, file);
    if (!map) return {line, column};
    return originalPositionFor(map, line, column) ?? {line, column};
}

/** Find a map by exact module URL, then by pathname (a stack may omit the origin). */
function lookup(registry: SourceMapRegistry, file: string): IRegisteredSourceMap | undefined {
    if (registry[file]) return registry[file];
    const path = pathnameOf(file);
    for (const [key, map] of Object.entries(registry)) {
        if (pathnameOf(key) === path) return map;
    }
    return undefined;
}

function pathnameOf(value: string): string {
    try {
        return new URL(value).pathname;
    } catch {
        return value.split(/[?#]/, 1)[0] as string;
    }
}

/**
 * Walk the encoded mappings to the segment that covers the generated position.
 *
 * A source map stores deltas: every segment starts with the generated column, then source index,
 * original line and original column, all relative to the previous segment. Only the original
 * position is returned, but every field is decoded because later segments depend on it.
 */
function originalPositionFor(
    map: IRegisteredSourceMap,
    line: number,
    column: number,
): IPosition | undefined {
    const targetLine = line - 1;
    const targetColumn = column - 1;
    const lines = map.mappings.split(';');

    let originalLine = 0;
    let originalColumn = 0;
    let best: IPosition | undefined;

    for (const [generatedLine, lineText] of lines.entries()) {
        let generatedColumn = 0;
        const segments = lineText.split(',');
        for (const segment of segments) {
            const fields = decodeSegment(segment);
            if (fields.length === 0) continue;
            generatedColumn += fields[0]!;
            if (fields.length >= 4) {
                originalLine += fields[2]!;
                originalColumn += fields[3]!;
            }
            if (
                generatedLine === targetLine &&
                generatedColumn <= targetColumn &&
                fields.length >= 4
            ) {
                best = {line: originalLine + 1, column: originalColumn + 1};
            }
        }
        if (generatedLine === targetLine) return best;
    }
    return undefined;
}

/** Decode one comma-delimited source-map segment into its signed fields. */
function decodeSegment(segment: string): number[] {
    const fields: number[] = [];
    let index = 0;
    while (index < segment.length) {
        let value = 0;
        let shift = 0;
        let digit: number;
        do {
            digit = BASE64.indexOf(segment[index++]!);
            if (digit < 0) return [];
            value += (digit & 31) << shift;
            shift += 5;
        } while (digit & 32);
        const negative = value & 1;
        value >>= 1;
        fields.push(negative ? -value : value);
    }
    return fields;
}
