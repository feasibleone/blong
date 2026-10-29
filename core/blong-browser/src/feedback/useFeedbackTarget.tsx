/**
 * useFeedbackTarget.tsx — how a component becomes addressable (`@@T-463`,
 * `@@T-487`, `@@D-667`).
 *
 * Three contexts, each read once per component and never subscribed to the
 * store: `FeedbackActiveContext` says whether the mode is on (published once by
 * `App`), `FeedbackPageContext` carries the model context a page publishes, and
 * `FeedbackPathContext` carries the path the enclosing containers compose.
 *
 * **A component that is not being annotated must cost nothing.** Every hook here
 * answers `undefined` while the mode is off — no identifier composed, no
 * attributes allocated, no provider rendered — so the call sites can write
 * `{...node?.attributes}` and `{...target?.(…)}`: an optional call does not even
 * evaluate its arguments, which is what keeps a `t(label)` out of the off path.
 * `FeedbackRegion` hands its child back untouched in that case rather than adding
 * a provider, and a parent that renders the element itself composes the step with
 * `appendSegment` instead of using it at all.
 */

import type {FeedbackTargetKind} from '@feasibleone/blong';
import {
    cloneElement,
    createContext,
    isValidElement,
    use,
    useCallback,
    useMemo,
    useRef,
    type ReactElement,
    type ReactNode,
} from 'react';

import {
    appendSegment,
    feedbackAttributes,
    pageIdOf,
    segmentOf,
    type IFeedbackModelContext,
} from './ids.js';

/** Whether the mode is on; published once, by `App` (`@@D-667`). */
export const FeedbackActiveContext = createContext(false);

/** What a page tells its children about itself; `null` outside a model page. */
export const FeedbackPageContext = createContext<IFeedbackModelContext | null>(null);

/** The path of the enclosing container, already composed. */
export const FeedbackPathContext = createContext<string | null>(null);

/** One shared empty result, for the paths that must answer with attributes anyway. */
const INERT: Record<string, string> = {};

/** The mode's own switch, read without subscribing to the store. */
export function useFeedbackActive(): boolean {
    return use(FeedbackActiveContext);
}

/**
 * The path a page starts from, or `undefined` while the mode is off.
 *
 * The identifier is only composed when something will carry it, so an inactive
 * tree pays two context reads and nothing else.
 */
function usePagePath(active: boolean): string | undefined {
    const page = use(FeedbackPageContext);
    const inherited = use(FeedbackPathContext);
    return useMemo(
        () => (active ? (inherited ?? pageIdOf(page)) : undefined),
        [active, inherited, page],
    );
}

/** The path in scope, for a component that needs to extend it by hand. */
export function useFeedbackPath(): string | undefined {
    const active = useFeedbackActive();
    return usePagePath(active);
}

export interface IFeedbackNode {
    /** The element's own identifier. */
    id: string;
    /** The path its children extend. */
    path: string;
    /** Attributes to spread on the element. */
    attributes: Record<string, string>;
}

/**
 * Publish a composed path to the subtree.
 *
 * Only rendered where a node exists: an inactive tree never reaches this
 * component, so it costs no element and no context.
 */
export function FeedbackPath({path, children}: {path: string; children: ReactNode}) {
    return <FeedbackPathContext value={path}>{children}</FeedbackPathContext>;
}

/**
 * Address one element and extend the path for its children.
 *
 * Take the node, spread `attributes`, and wrap the children in
 * `<FeedbackPath path={node.path}>` — the whole protocol. `undefined` while the
 * mode is off, so the call site spreads nothing and nests nothing.
 */
export function useFeedbackNode(
    kind: FeedbackTargetKind,
    name?: string,
    label?: string,
): IFeedbackNode | undefined {
    const active = useFeedbackActive();
    const parent = usePagePath(active);
    return useMemo(() => {
        if (!active || !parent) return undefined;
        const id = appendSegment(parent, kind, name);
        return {id, path: id, attributes: feedbackAttributes(id, kind, label)};
    }, [active, parent, kind, name, label]);
}

/**
 * The page root: its identifier and the path its children extend.
 *
 * Read from the context the component owns rather than one it inherits — an
 * `Editor` publishes the context it was given, so it cannot read it from the tree
 * above itself.
 */
export function useFeedbackPage(
    context: IFeedbackModelContext | null | undefined,
): IFeedbackNode | undefined {
    const active = useFeedbackActive();
    return useMemo(() => {
        if (!active) return undefined;
        const id = pageIdOf(context);
        return {id, path: id, attributes: feedbackAttributes(id, 'page')};
    }, [active, context]);
}

/** The identifier of one segment, for a place that builds a path by hand. */
export function segmentId(kind: FeedbackTargetKind, name?: string): string {
    return segmentOf(kind, name);
}

/**
 * A factory for components that render targets in a loop — a table whose rows are
 * columns, a list of cards. Hooks cannot be called inside a `map`, so the context
 * is read once here and the returned function composes an identifier per item.
 *
 * `undefined` while the mode is off: the call sites write `target?.(…)`, and an
 * optional call evaluates none of its arguments.
 */
export function useFeedbackTargetFactory(
    base?: string,
):
    | ((kind: FeedbackTargetKind, name?: string, label?: string) => Record<string, string>)
    | undefined {
    const active = useFeedbackActive();
    const parent = usePagePath(active);
    const path = base ?? parent;
    const pathRef = useRef(path);
    pathRef.current = path;
    const compose = useCallback((kind: FeedbackTargetKind, name?: string, label?: string) => {
        const current = pathRef.current;
        return current
            ? feedbackAttributes(appendSegment(current, kind, name), kind, label)
            : INERT;
    }, []);
    // `undefined` rather than a function that answers nothing: `factory?.(…)
    // stops at the call and never evaluates the arguments.
    return active ? compose : undefined;
}

/** Attributes for the page root, when the path is not needed. */
export function useFeedbackPageTarget(
    context: IFeedbackModelContext | null | undefined,
): Record<string, string> | undefined {
    return useFeedbackPage(context)?.attributes;
}

/**
 * Attributes to spread on an element that is addressable but has no addressable
 * children — a label, a column header, a button.
 *
 * `undefined` while the mode is off, so the caller spreads nothing at all.
 *
 * @param kind  the kind of thing the element is
 * @param name  the model's own name for it (`cardName`, a dotted field path, a
 *              toolbar action, a menu method); never an index
 * @param label the translated visible label, so a reader without the source has
 *              a chance of finding the element the identifier names
 */
export function useFeedbackTarget(
    kind: FeedbackTargetKind,
    name?: string,
    label?: string,
): Record<string, string> | undefined {
    const active = useFeedbackActive();
    const parent = usePagePath(active);
    return useMemo(
        () =>
            active && parent
                ? feedbackAttributes(appendSegment(parent, kind, name), kind, label)
                : undefined,
        [active, parent, kind, name, label],
    );
}

/**
 * Address a single element the parent cannot annotate itself.
 *
 * The parent cannot call a hook for a path its own provider has not published
 * yet, and some children own their markup — a PrimeReact table renders its
 * columns inside itself, so the table has to be the one carrying the step. This
 * clones that one element with the attributes and publishes the path above it.
 *
 * For anything the parent does render itself, compose the step by hand instead
 * (`appendSegment(page.path, 'toolbar')` + `<FeedbackPath>`) — that costs no
 * component at all. While the mode is off the child comes back untouched: no
 * provider, no clone, no wrapper.
 */
export function FeedbackRegion({
    kind,
    name,
    label,
    children,
}: {
    kind: FeedbackTargetKind;
    name?: string;
    label?: string;
    children: ReactNode;
}) {
    const node = useFeedbackNode(kind, name, label);
    if (!node) return children;
    // The point of the region is that it adds no element of its own: the caller's
    // child *is* the target, so the attributes are merged into it rather than into
    // a wrapper that would change every layout it touches.
    const body = isValidElement(children)
        ? // eslint-disable-next-line @eslint-react/no-clone-element
          cloneElement(children as ReactElement<Record<string, string>>, node.attributes)
        : children;
    return <FeedbackPathContext value={node.path}>{body}</FeedbackPathContext>;
}
