/**
 * What a row has picked while it is being edited.
 *
 * A row being edited keeps its draft to itself until the row is saved, and the cell
 * editors are mounted the moment the row enters edit mode. A cell whose list is
 * narrowed by a sibling would therefore keep the list it computed at that moment — for
 * a new row, the whole list, because the sibling is still empty — and the pick that
 * should narrow it would change nothing on screen. So the table remembers the picks in
 * the fields a cascade depends on, hands them to the cells through a context (a
 * consumer re-renders past PrimeReact's memoized cell), and forgets them when the row
 * stops being edited. `@@D-617`
 */
import {useCallback, useMemo, useState} from 'react';
import {KEY, type Row} from './model.js';

/** A column whose list is narrowed by a sibling, or by its `parent`. */
export interface ICascadeColumn {
    fieldSchema: {widget?: {parent?: string; optionsFilter?: Record<string, string>}};
}

export function useRowDrafts(columns: ICascadeColumn[]) {
    const cascadeFields = useMemo(() => {
        const fields = new Set<string>();
        for (const col of columns) {
            const widget = col.fieldSchema.widget;
            if (widget?.parent) fields.add(widget.parent);
            for (const rowField of Object.values(widget?.optionsFilter ?? {})) {
                fields.add(String(rowField));
            }
        }
        return fields;
    }, [columns]);

    const [rowDrafts, setRowDrafts] = useState<Record<string, Row>>({});

    const recordRowDraft = useCallback(
        (row: Row, field: string, value: unknown) => {
            if (!cascadeFields.has(field)) return;
            const key = String(row[KEY]);
            setRowDrafts(prev => ({...prev, [key]: {...prev[key], [field]: value}}));
        },
        [cascadeFields],
    );

    /** A row that is no longer edited leaves no picks behind. */
    const clearRowDrafts = useCallback(() => setRowDrafts({}), []);

    return {rowDrafts, recordRowDraft, clearRowDrafts};
}
