/**
 * glassReflection — runtime positioning for the glass theme glare.
 *
 * The layout can hold several vertical "lanes": a full-width header toolbar,
 * one or two card columns (content re-lays itself between a single and two
 * columns as the width changes), and a separate Form Inspector rail. A real
 * glare is a straight light edge, and panels that stack in the SAME lane share
 * it, so their silver → black edges are all segments of ONE straight line
 * (tops and bottoms align). Different lanes get their own parallel edges —
 * they do not try to share the header's line because the header spans the
 * whole width.
 *
 * The knob is the CSS `linear-gradient` axis angle `GLARE_ANGLE_DEG`
 * (measured clockwise from the top, like `linear-gradient(103deg, …)`). The
 * visible light/dark edge is PERPENDICULAR to that axis:
 *
 *   axis 90°  (gradient → right)  ⇒ edge vertical   (left lit / right dark)
 *   axis 103°                     ⇒ edge ≈ 77° from horizontal (steep)
 *   axis 135°                     ⇒ edge ≈ 45°
 *   axis 150°                     ⇒ edge ≈ 30° (nearly horizontal — flat)
 *   axis 180°  (gradient → down)  ⇒ edge horizontal (top lit / bottom dark)
 *
 * So to make the light/dark edge MORE VERTICAL, move the axis toward 90°.
 *
 * Geometry per lane: the gradient starts (silver) at the box corner with the
 * smallest projection onto the axis, and the edge sits where the projection
 * equals one fixed constant `C` for the whole lane. Each member's shift is
 *
 *   shift_i = (C − axis-projection of panel top-left) / axis span of panel i
 *
 * with `C` anchored at the lane's top-most CARD (not the wide header) so the
 * reflection is centred on the content column, not stretched by the header.
 * Panels that fall fully on the dark side of their lane's edge keep a faint
 * top-left sheen instead of turning solid black.
 */

/**
 * CSS linear-gradient axis angle (degrees) — the single knob, 90..180.
 * Larger → axis more vertical (edge more horizontal); smaller → axis more
 * horizontal (edge more vertical). See the note above. The CSS gradients read
 * the pinned `--glare-angle` and this module derives shifts from the same
 * angle, so the two always agree.
 */
export const GLARE_ANGLE_DEG = 103;

/** Glass surfaces that carry the silver → black edge. */
export const GLASS_PANEL_SELECTOR =
    '.p-card, .p-toolbar, .blong-property-editor.blong-inspector';

/** A full-width header toolbar spans at least this share of the app width. */
const HEADER_TOOLBAR_MIN_WIDTH = 0.6;
/** Matches the Form Inspector rail (gets its own independent gradient). */
const INSPECTOR_SELECTOR = '.blong-property-editor.blong-inspector';

/** Edge position on the lane anchor (top-most card), as a 0..1 span fraction. */
const ANCHOR_FRACTION = 0.5;
/** Safety clamp so a panel on the edge never collapses to one solid colour. */
const MIN_FRACTION = 0.06;
const MAX_FRACTION = 0.94;
/** Far-side falloff (panels fully in shadow keep a faint top-left sheen). */
const FALLOFF_TOP = 0.4;
const FALLOFF_BOTTOM = 0.1;
/** Independent Form Inspector edge fraction ("starting at the middle"). */
const INSPECTOR_FRACTION = 0.5;
/** Horizontal gap (px) between column centres that counts as a new lane. */
const COLUMN_GAP = 120;

const RAD = (GLARE_ANGLE_DEG * Math.PI) / 180;
// Axis direction on screen (y grows downward) for an angle in (90, 180):
// sin > 0, −cos > 0 → down-right. Silver starts at the top-left corner.
const AXIS_X = Math.sin(RAD);
const AXIS_Y = -Math.cos(RAD);

interface IPanel {
    element: HTMLElement;
    x: number; // left edge, relative to the glass wrapper
    y: number; // top edge, relative to the glass wrapper
    w: number;
    h: number;
    span: number; // axis span = w·AXIS_X + h·AXIS_Y
    s: number; // axis projection of the top-left corner
    isHeader: boolean;
    isInspector: boolean;
}

/** Build the per-panel geometry needed to place edges. */
function collectPanels(scope: HTMLElement): IPanel[] {
    const rect = scope.getBoundingClientRect();
    const left = rect.left;
    const top = rect.top;
    const result: IPanel[] = [];
    for (const element of Array.from(
        scope.querySelectorAll<HTMLElement>(GLASS_PANEL_SELECTOR),
    )) {
        const b = element.getBoundingClientRect();
        const w = b.width;
        const h = b.height;
        const span = w * AXIS_X + h * AXIS_Y;
        if (!Number.isFinite(span) || span <= 0) continue;
        const x = b.left - left;
        const y = b.top - top;
        result.push({
            element,
            x,
            y,
            w,
            h,
            span,
            s: x * AXIS_X + y * AXIS_Y,
            isHeader:
                element.classList.contains('p-toolbar') &&
                w >= rect.width * HEADER_TOOLBAR_MIN_WIDTH,
            isInspector: element.matches(INSPECTOR_SELECTOR),
        });
    }
    return result;
}

/** Group flow panels (cards + inner toolbars) into columns by centre x. */
function clusterColumns(panels: IPanel[]): IPanel[][] {
    const sorted = [...panels].sort(
        (a, b) => a.x + a.w / 2 - (b.x + b.w / 2),
    );
    const clusters: IPanel[][] = [];
    let lastCentre = Number.NEGATIVE_INFINITY;
    for (const p of sorted) {
        const centre = p.x + p.w / 2;
        if (clusters.length === 0 || centre - lastCentre > COLUMN_GAP) {
            clusters.push([p]);
        } else {
            clusters[clusters.length - 1].push(p);
        }
        lastCentre = centre;
    }
    return clusters;
}

/** Anchor of a lane = its top-most card (a full-width header skews the span). */
function laneAnchor(lane: IPanel[]): IPanel {
    const candidates = lane.filter((p) => !p.isHeader);
    const pool = candidates.length > 0 ? candidates : lane;
    let anchor = pool[0];
    for (const p of pool) {
        if (p.y < anchor.y) anchor = p;
    }
    return anchor;
}

/** Set every member of a lane on one straight edge; far-side members fall back. */
function placeLane(lane: IPanel[]): void {
    const anchor = laneAnchor(lane);
    const edgeC = anchor.s + ANCHOR_FRACTION * anchor.span;

    let minS = lane[0].s;
    let maxS = lane[0].s;
    for (const p of lane) {
        if (p.s < minS) minS = p.s;
        if (p.s > maxS) maxS = p.s;
    }
    const spanS = maxS - minS || 1;

    for (const p of lane) {
        let fraction = (edgeC - p.s) / p.span;
        if (fraction < MIN_FRACTION) {
            const ratio = (p.s - minS) / spanS;
            fraction =
                FALLOFF_TOP - ratio * (FALLOFF_TOP - FALLOFF_BOTTOM);
        } else if (fraction > MAX_FRACTION) {
            fraction = MAX_FRACTION;
        }
        p.element.style.setProperty(
            '--glare-shift',
            `${(fraction * 100).toFixed(2)}%`,
        );
    }
}

/**
 * Recompute `--glare-shift` per lane so each lane's silver→black edges lie on
 * ONE straight line, pin the shared `--glare-angle`, and give the Form
 * Inspector its independent centered gradient. Runs on every size change, so
 * the lanes follow the responsive single / two column layout automatically.
 */
export function updateGlassReflections(scope: HTMLElement): void {
    if (!scope || typeof scope.getBoundingClientRect !== 'function') return;

    // Keep the gradient axis in sync (the CSS gradients read this variable).
    scope.style.setProperty('--glare-angle', `${GLARE_ANGLE_DEG}deg`);

    const all = collectPanels(scope);
    if (all.length === 0) return;

    const header = all.find((p) => p.isHeader);
    const flow = all.filter((p) => !p.isInspector && !p.isHeader);

    // Columns of cards / inner toolbars (the header never joins this cluster).
    const columns = clusterColumns(flow);

    if (columns.length === 0) {
        // No cards at all — place any lone header on its own edge.
        if (header) placeLane([header]);
    } else {
        // The LEFT-most lane is joined by the header so the toolbar and the
        // left card column share one straight edge. Further columns get their
        // own parallel edges (they cannot share the full-width header line).
        const leftLane = columns[0];
        if (header) leftLane.push(header);
        placeLane(leftLane);
        for (const column of columns.slice(1)) {
            placeLane(column);
        }
    }

    // Form Inspector: independent gradient, boundary at its middle.
    for (const p of all) {
        if (!p.isInspector) continue;
        p.element.style.setProperty(
            '--glare-shift',
            `${(INSPECTOR_FRACTION * 100).toFixed(2)}%`,
        );
    }
}
