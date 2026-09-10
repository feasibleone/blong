import {isGenerated, type PrimitiveHost} from '../engine.ts';

/** Reading side of composition — the counterpart to `merge.ts`. */

/**
 * The content of an existing file, but only when it is machine-generated.
 *
 * Merging into a hand-written file would be guesswork, so composition is limited
 * to files that carry the generated marker; anything else is reported to the
 * caller instead of silently rewritten.
 */
export function readGenerated(host: PrimitiveHost, root: string, path: string): string | undefined {
    const absolute = host.join(root, path);
    if (!host.existsSync(absolute)) return undefined;
    const source = String(host.readFileSync(absolute, {encoding: 'utf-8'}));
    return isGenerated(source) ? source : undefined;
}
