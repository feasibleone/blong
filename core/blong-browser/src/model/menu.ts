/**
 * menu.ts — how a model spec becomes a menubar entry.
 *
 * The aggregator used to push every page into one group titled after the subject,
 * which works for four pages and not for twenty: the menubar grows past the height
 * of a laptop screen and nothing is findable. A model now says where it belongs
 * (`IModelSpec.menu`) or marks itself as reference data (`classifier`), and this
 * file turns that into the group/leaf shape the portal renders.
 *
 * The rules are stated once, here, and are pure so they can be tested without a
 * port:
 *
 * - default: flat group titled `subjectTitle` (the subject, capitalized);
 * - `classifier`: the shared `CLASSIFIER_ROOT` group, with one submenu per realm
 *   named after its `subjectTitle` — the same pickers every realm's forms use;
 * - `menu.group`: a flat group with that title (a realm splitting its pages);
 * - `menu.root` + `menu.group`: nested;
 * - `menu.hidden`: no menu entry at all.
 *
 * Group ids are derived from the title and stay language-independent, which is
 * what the Playwright selectors and the portal's `data-testid` rely on.
 */
import type {IModelMenu, IResolvedModelSpec} from '@feasibleone/blong';
import type {IMenuItem} from '../types/portal.js';

/** The shared root every `classifier: true` page lands in. */
export const CLASSIFIER_ROOT = 'Classifiers';

/**
 * A leaf: the page's method, the label it sorts by, and where the model put it.
 *
 * `title` travels with the entry as the sort key and as the label a menu without a
 * component slice would fall back on; the portal still takes the rendered title
 * from the slice, so a translated page keeps its translated name.
 */
export interface IMenuLeaf {
    /** English label — `objectTitle` unless the model names one. */
    title: string;
    method: string;
    icon?: string;
    /** Position inside the group; absent means "after the ordered ones, alphabetically". */
    order?: number;
}

/** A group of entries — the portal renders this as a submenu. */
export interface IMenuGroup {
    id?: string;
    title: string;
    items: IMenuNode[];
}

export type IMenuNode = IMenuLeaf | IMenuGroup;

/** Stable, language-independent identifier for a group title. */
export function menuGroupId(title: string): string {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

/** Resolved placement of one page: `undefined` means "no menu entry". */
export interface IMenuPlacement {
    root: string;
    group?: string;
}

/** Where a model's browse page belongs in the menubar. */
export function menuPlacement(model: IResolvedModelSpec): IMenuPlacement | undefined {
    const menu: IModelMenu = model.menu ?? {};
    if (menu.hidden) return undefined;
    if (model.classifier) {
        return {
            root: menu.root ?? CLASSIFIER_ROOT,
            group: menu.group ?? model.subjectTitle,
        };
    }
    // No `root` means the named group is the top level, so `group` alone moves a
    // page into another flat group instead of nesting it one level down.
    if (menu.group && !menu.root) return {root: menu.group};
    return {root: menu.root ?? model.subjectTitle, ...(menu.group && {group: menu.group})};
}

/** The menubar leaf for a model's browse page. */
export function menuLeaf(model: IResolvedModelSpec): IMenuLeaf {
    const menu: IModelMenu = model.menu ?? {};
    return {
        title: menu.title ?? model.objectTitle,
        method: `${model.subject}.${model.object}.browse`,
        ...(menu.icon && {icon: menu.icon}),
        ...(menu.order !== undefined && {order: menu.order}),
    };
}

/**
 * Add one page to the menu tree in place.
 *
 * `menus` is the aggregator's accumulated map — root title → its entries — so a
 * second realm contributing to `Classifiers` finds the root already there and
 * merges into its own submenu, and a suite that adds a group of its own does not
 * lose the generated ones.
 */
export function addMenuEntry(menus: Record<string, IMenuNode[]>, model: IResolvedModelSpec): void {
    const placement = menuPlacement(model);
    if (!placement) return;
    const root = (menus[placement.root] ||= []);
    const leaf = menuLeaf(model);
    if (!placement.group) {
        root.push(leaf);
        return;
    }
    let group = root.find(
        (entry): entry is IMenuGroup =>
            typeof entry === 'object' && 'items' in entry && entry.title === placement.group,
    );
    if (!group) {
        group = {
            // Qualified by the root: the classifier submenu is titled `Sport`, as is
            // the realm's own group, and two groups sharing an id makes the portal's
            // `data-testid` ambiguous.
            id: menuGroupId(`${placement.root}-${placement.group}`),
            title: placement.group,
            items: [],
        };
        root.push(group);
    }
    group.items.push(leaf);
}

/**
 * The order an entry asks for, or `undefined` when the model named none.
 *
 * A group sorts by this first and then by label, so a realm that orders two of
 * its pages gets those two at the top and the rest alphabetically, and a realm
 * that orders none gets an alphabetically sorted menu without doing anything.
 */
function ordered(entry: IMenuNode): boolean {
    return typeof entry === 'object' && 'method' in entry && entry.order !== undefined;
}

function orderValue(entry: IMenuNode): number {
    return typeof entry === 'object' && 'method' in entry ? (entry.order ?? 0) : 0;
}

/** Sort one group's entries in place: explicit order first, then alphabetical. */
function sortEntries(items: IMenuNode[]): void {
    items.sort((left, right) => {
        const leftOrdered = ordered(left);
        const rightOrdered = ordered(right);
        if (leftOrdered && rightOrdered) return orderValue(left) - orderValue(right);
        if (leftOrdered) return -1;
        if (rightOrdered) return 1;
        return left.title.localeCompare(right.title, undefined, {sensitivity: 'base'});
    });
    for (const entry of items) {
        if (typeof entry === 'object' && 'items' in entry) sortEntries(entry.items);
    }
}

/** Drop the sort key the menu model does not carry (`IAction` has no `order`). */
function emitted(entry: IMenuNode): IMenuNode {
    if (typeof entry !== 'object' || !('method' in entry)) return entry;
    const {order: _order, ...leaf} = entry;
    return leaf;
}

/**
 * The generated menu, with the shared classifier root last: a realm's own pages
 * are what its people open all day, and reference data is looked up by exception.
 */
export function menuGroups(menus: Record<string, IMenuNode[]>): IMenuItem[] {
    const groups = Object.entries(menus).map(([title, items]) => {
        sortEntries(items);
        return {
            id: menuGroupId(title),
            title,
            items: items.map(emitted),
        };
    });
    return [
        ...groups.filter(group => group.title !== CLASSIFIER_ROOT),
        ...groups.filter(group => group.title === CLASSIFIER_ROOT),
    ] as IMenuItem[];
}
