/**
 * Minimal ULID generator (time-ordered unique IDs).
 * Used for tab IDs and toast IDs.
 */
export function ulid(): string {
    const time = Date.now();
    const random = Math.random().toString(36).slice(2, 12).toUpperCase().padEnd(10, '0');
    const timeStr = time.toString(36).toUpperCase().padStart(10, '0');
    return `${timeStr}${random}`;
}
