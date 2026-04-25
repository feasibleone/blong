import {type IMeta, handler} from '@feasibleone/blong';

// Module-level promise cache keyed by '{subject}.dropdown.list'.
// Caches the in-flight / resolved promise so concurrent calls from
// multiple components don't issue duplicate backend requests.
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
                                pending.delete(method);
                                return {} as Record<string, unknown>;
                            });
                        pending.set(method, promise);
                    }
                    return pending.get(method)!;
                }),
            );
            return Object.assign({}, ...results);
        },
);
