/**
 * The two letters a nameless picture falls back to.
 *
 * One behaviour, two callers: the account menu's avatar and a blob that has no photograph yet. A name of
 * two or more words answers its first and last initial, a single long word answers its first two letters
 * — which is what makes `Jane Doe` read `JD` and `blong` read `BL` (@@D-842).
 */
export function deriveInitials(name: string | undefined | null): string | undefined {
    if (!name) return undefined;
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts[0] && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
    return parts[0]?.[0]?.toUpperCase();
}
