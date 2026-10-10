/**
 * `getPath` — read a dot path off a row.
 *
 * A commander level names the value it displays as a dot path (`metadata.name`),
 * and the same path has to be read from two shapes: an already-flattened row, where
 * the path is a literal key, and the raw object a backend answered with. Both are
 * served by traversing the path segments, because a literal key is a one-segment
 * traversal of a flat object.
 *
 * Shared by the ordering (`sortRows`) and the whitelist/blacklist
 * (`levelRowsSelect`), because both ask the same question — *what does this level
 * display for this row* — and two readers would eventually disagree about it.
 */
export function getPath(obj: Record<string, unknown> | undefined, path: string): unknown {
    if (!obj) return undefined;
    let cur: unknown = obj;
    for (const part of path.split('.')) {
        if (cur === null || cur === undefined) return undefined;
        cur = (cur as Record<string, unknown>)[part];
    }
    return cur;
}
