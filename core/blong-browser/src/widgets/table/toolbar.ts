/**
 * The table's own toolbar: the buttons a widget declares, with their `params`
 * template resolved against the row the reader is on.
 *
 * A template is a small language (`${field}`, `$.selected.x`, a whole-string form that
 * returns the value as it is) and it belongs beside the buttons that use it, not in the
 * component that also owns rows, paging and editing.
 */
import type {IWidgetToolbarButton} from '@feasibleone/blong';
import type {Row} from './model.js';

export function getPath(obj: unknown, path: string): unknown {
    if (!obj || typeof obj !== 'object') return undefined;
    const parts = path.split('.');
    let cur: unknown = obj;
    for (const part of parts) {
        if (cur === null || cur === undefined) return undefined;
        cur = (cur as Record<string, unknown>)[part];
    }
    return cur;
}

export function resolveToolbarParams(
    params: Record<string, unknown> | string | undefined,
    context: Record<string, unknown>,
): Record<string, unknown> | undefined {
    if (params === undefined || params === null) return undefined;
    if (typeof params === 'string') {
        const singleExpr = params.trim().match(/^\$\{([^}]+)\}$/);
        if (singleExpr) {
            const val = getPath(context, singleExpr[1].trim());
            if (val !== null && typeof val === 'object') return val as Record<string, unknown>;
            return {value: val};
        }
        const resolved = params.replace(/\$\{([^}]+)\}/g, (_, expr) => {
            const v = getPath(context, (expr as string).trim());
            return v === undefined || v === null
                ? ''
                : typeof v === 'object'
                  ? JSON.stringify(v)
                  : String(v);
        });
        return {value: resolved};
    }
    return Object.fromEntries(
        Object.entries(params).map(([k, v]) => {
            if (typeof v === 'string') {
                const r = resolveToolbarParams(v, context);
                return [k, r?.value !== undefined ? r.value : r];
            }
            return [k, v];
        }),
    );
}

export function evalToolbarEnabled(
    enabled: IWidgetToolbarButton['enabled'],
    selection: Row[],
    currentRow: Row | null,
): boolean {
    if (enabled === 'current') return currentRow !== null;
    if (enabled === 'selected') return selection.length > 0 || currentRow !== null;
    return enabled !== false;
}
