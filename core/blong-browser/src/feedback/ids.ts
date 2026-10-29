/**
 * ids.ts — the identifier grammar and the DOM attributes that carry it
 * (`@@T-462`, `@@T-487`).
 *
 * An identifier is the path a person walked to reach the element, not a flat
 * suffix: a page id, then one segment per container, then the element itself.
 *
 *     <subject>.<object>.<page>[/<kind>[:<name>]]…
 *     sport.club.open/editor/toolbar/button:save
 *     sport.club.open/editor/card:clubDetails/field:clubShortName/label:clubs
 *     blong.portal.page/menu:sport/menuItem:sport.club.browse
 *
 * A segment is a kind and, when the model has a name for the thing, that name: a
 * `cardName`, a dotted field path, a column field, a toolbar action, a menu
 * method. **An array index is never a name** — a row's position says nothing
 * about which row it is, and an identifier that moved when a table paged would be
 * useless to the features that will be built on it (context-sensitive help,
 * Playwright selectors, descriptive prose).
 *
 * Two separators, deliberately: `/` between segments, `.` inside the page id and
 * inside a name. A reader can therefore take the tail (`shortTargetId`) for a
 * badge and keep the whole string for a title.
 */

import type {FeedbackTargetKind, IFeedbackTarget} from '@feasibleone/blong';

export const FEEDBACK_ID_ATTR = 'data-feedback-id';
export const FEEDBACK_KIND_ATTR = 'data-feedback-kind';
export const FEEDBACK_LABEL_ATTR = 'data-feedback-label';
/** Marks the mode's own chrome, which the guard lets through and the capture hides. */
export const FEEDBACK_UI_ATTR = 'data-feedback-ui';
/** Set on `<html>` while the screenshot is taken, so the overlay leaves the picture. */
export const FEEDBACK_CAPTURE_ATTR = 'data-feedback-capture';

/** What a page tells its children about itself. */
export interface IFeedbackModelContext {
    /** Realm or, for a framework screen, `blong`. */
    subject: string;
    /** Model object, or the page name for a screen that belongs to no model. */
    object: string;
    /** `browse` | `new` | `open` | `report` | `report.<id>` | `page`. */
    page: string;
}

/** The context a page that names no model gets, so an identifier always exists. */
export function fallbackContext(route: string): IFeedbackModelContext {
    return {subject: 'blong', object: route || 'portal', page: 'page'};
}

/** The page an identifier starts from: `sport.club.open`, `blong.portal.page`. */
export function pageIdOf(context: IFeedbackModelContext | null | undefined): string {
    if (!context) return 'blong.portal.page';
    return `${context.subject}.${context.object}.${context.page}`;
}

/**
 * A name that survives a translation and a redesign: the ASCII form of the
 * English label, lower case, hyphenated. `Legal Name` → `legal-name`.
 *
 * It is the _source_ text, never what the screen shows — a language switch must
 * not move an identifier — and an empty answer means "no name", not `''`.
 */
export function nameOfLabel(text: string | undefined): string | undefined {
    const slug = (text ?? '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48)
        .replace(/-+$/g, '');
    return slug || undefined;
}

/** One step of the path: the kind, and the model's name for the thing when it has one. */
export function segmentOf(kind: FeedbackTargetKind, name?: string): string {
    const trimmed = name?.trim();
    return trimmed ? `${kind}:${trimmed}` : kind;
}

/** Compose a path from a page id and the segments below it. */
export function buildFeedbackPath(pageId: string, segments: readonly string[]): string {
    return [pageId, ...segments.filter(Boolean)].join('/');
}

/** Append one segment to a path. */
export function appendSegment(path: string, kind: FeedbackTargetKind, name?: string): string {
    return `${path}/${segmentOf(kind, name)}`;
}

/**
 * The readable tail of an identifier, for a badge: the last named segment and
 * whatever unnamed parts follow it.
 *
 * `…/field:clubShortName/label:clubs` → `clubShortName.label-clubs`; the page
 * itself, which has no named segment, answers with its own id.
 */
export function shortTargetId(id: string): string {
    if (!id) return '';
    const segments = id.split('/');
    if (segments.length === 1) return id;
    let named = -1;
    for (let index = segments.length - 1; index >= 0; index--) {
        if (segments[index].includes(':')) {
            named = index;
            break;
        }
    }
    if (named < 0) return segments.slice(-2).join('/');
    const name = segments[named].slice(segments[named].indexOf(':') + 1);
    return [name, ...segments.slice(named + 1)].join('.');
}

/** Attributes to spread on an element, or an empty object when the mode is off. */
export function feedbackAttributes(
    id: string | undefined,
    kind: FeedbackTargetKind,
    label?: string,
): Record<string, string> {
    if (!id) return {};
    return {
        [FEEDBACK_ID_ATTR]: id,
        [FEEDBACK_KIND_ATTR]: kind,
        ...(label ? {[FEEDBACK_LABEL_ATTR]: label} : {}),
    };
}

/**
 * An identifier for a framework screen that belongs to no realm.
 *
 * `blong` is the subject of the portal's own chrome — its menu, its tabs, its
 * page — so a comment about the menubar still names something (`@@D-657`).
 */
export function portalFeedbackId(
    part: 'tab' | 'menu' | 'menuItem' | 'page',
    partId?: string,
): string {
    return buildFeedbackPath('blong.portal.page', [segmentOf(part, partId)]);
}

/** The nearest addressable ancestor of an event target. */
export function closestFeedbackTarget(node: EventTarget | null): HTMLElement | null {
    if (!(node instanceof Element)) return null;
    const element = node.closest(`[${FEEDBACK_ID_ATTR}]`);
    return element instanceof HTMLElement ? element : null;
}

/** Whether the node belongs to the mode's own chrome (callouts, bar, toggle). */
export function isFeedbackUi(node: EventTarget | null): boolean {
    return node instanceof Element && Boolean(node.closest(`[${FEEDBACK_UI_ATTR}]`));
}

/** A short description of the element, so a reader has context when an id goes stale. */
export function domHintOf(element: HTMLElement): string | undefined {
    const parts = [element.tagName.toLowerCase()];
    const aria = element.getAttribute('aria-label');
    const title = element.getAttribute('title');
    if (aria) parts.push(`aria-label="${aria}"`);
    if (title) parts.push(`title="${title}"`);
    return parts.join(' ');
}

/** Read the target an element carries. */
export function targetOf(element: HTMLElement): IFeedbackTarget | null {
    const targetId = element.getAttribute(FEEDBACK_ID_ATTR);
    if (!targetId) return null;
    const kind = (element.getAttribute(FEEDBACK_KIND_ATTR) ?? 'section') as FeedbackTargetKind;
    const label = element.getAttribute(FEEDBACK_LABEL_ATTR) ?? undefined;
    const domHint = domHintOf(element);
    return {
        targetId,
        targetKind: kind,
        ...(label ? {targetLabel: label} : {}),
        ...(domHint ? {domHint} : {}),
    };
}

/** The element's rectangle in the coordinates a callout is positioned in. */
export function rectOf(element: Element): {x: number; y: number; width: number; height: number} {
    const rect = element.getBoundingClientRect();
    return {x: rect.left, y: rect.top, width: rect.width, height: rect.height};
}
