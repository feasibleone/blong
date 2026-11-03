import {type IMeta, handler} from '@feasibleone/blong';

/**
 * In-flight calls keyed by '{subject}.dropdown.list'.
 *
 * The point is de-duplication, not caching: the widgets of one form mount together and must
 * not each ask for the same list. The entry is therefore dropped when the call settles —
 * keeping the resolved promise made the first answer of a session the only answer, so a
 * record created or deleted afterwards was still offered by every picker, and a form could
 * submit an id that no longer exists (the foreign key refused the insert). A list is
 * re-read when a page opens, which is what a reload did (`@@D-748`).
 */
const pending = new Map<string, Promise<Record<string, unknown>>>();

export default handler(
    ({handler}) =>
        async function portalDropdownList(
            {names}: {names: string[]},
            $meta: IMeta,
        ): Promise<Record<string, unknown>> {
            // Deduplicate subjects so each backend method is called only once
            const subjects = Array.from(new Set(names.map(n => n.split('.')[0])));
            const results = await Promise.all(
                subjects.map(subject => {
                    const method = `${subject}.dropdown.list`;
                    if (!pending.has(method)) {
                        const methodHandler = handler[method] as
                            | ((p: object, m: IMeta) => Promise<Record<string, unknown>>)
                            | undefined;
                        if (!methodHandler) return Promise.resolve({} as Record<string, unknown>);
                        const promise = methodHandler({}, {...$meta, method})
                            .then((raw: Record<string, unknown>) => {
                                // Re-key short names to full dotted names:
                                // {family: [...]} → {'marine.family': [...]}
                                const out: Record<string, unknown> = {};
                                for (const [k, v] of Object.entries(raw)) {
                                    out[k] = v;
                                }
                                return out;
                            })
                            .catch(() => {
                                return {} as Record<string, unknown>;
                            })
                            .finally(() => {
                                pending.delete(method);
                            });
                        pending.set(method, promise);
                    }
                    return pending.get(method)!;
                }),
            );
            return Object.assign({}, ...results);
        },
);
