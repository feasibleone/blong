import {type IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';

/** One selectable translation target. */
interface IOption {
    value: string;
    label: string;
}

/**
 * `core.dropdown.list` — the auto-bound map plus the resources a translation
 * editor may target.
 *
 * The generic list (reached through `super.exec`) is the per-table map every
 * realm gets for free — one entry per resource-backed table, each option already
 * carrying the base64 resource id as its value. An override that answered one
 * key would leave the rest empty, so the base is spread in first.
 *
 * `core.translationResource` is built FROM that map rather than from a second
 * query: those are exactly the resources a dropdown shows, which is the set the
 * requirement targets, and it needs no per-suite configuration. Core's own
 * tables are skipped — `core.label` and `core.translation` carry a resource FK
 * for their editor, not a vocabulary anybody translates. Each label is prefixed
 * with its type alias, because one picker serves several classifiers and
 * `Athletics` alone would be ambiguous.
 */
export default handler(() => ({
    async coreDropdownList(
        _params: Record<string, unknown>,
        $meta: IMeta,
    ): Promise<Record<string, unknown>> {
        const base = (await super.exec({}, $meta)) as Record<string, unknown>;

        const options: IOption[] = [];
        for (const [name, list] of Object.entries(base)) {
            if (name.startsWith('core.')) continue;
            if (!Array.isArray(list)) continue;
            for (const option of list as IOption[]) {
                if (!option?.value) continue;
                options.push({value: option.value, label: `${name} — ${option.label}`});
            }
        }
        options.sort((a, b) => a.label.localeCompare(b.label, 'en'));

        return {...base, 'core.translationResource': options};
    },
}));
