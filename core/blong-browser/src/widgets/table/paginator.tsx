/**
 * The paginator a list table shows under its rows.
 *
 * Paging is the caller's, not the widget's: the component says how many rows there
 * are and where the page starts, and this asks for another page. Kept on its own so
 * the table's own render reads as rows and columns rather than five arrow buttons.
 *
 * The total is optional. A read that reports it (the generic `find` does when the
 * caller asks for a count) gives the "page / pages" answer and a last-page jump; a
 * read that answers a bare page leaves both out, and the forward arrows follow
 * `hasMore` — a full page may have more behind it.
 */
import {Button} from '../../components/Button/Button.js';

/** The page sizes a reader may pick. */
const PAGE_SIZES = [10, 25, 50, 100];

export function TablePaginator({
    first,
    pageSize,
    total,
    hasMore,
    onFirstChange,
    onPageSizeChange,
}: {
    /** The index of the first row on screen. */
    first: number;
    pageSize: number;
    /** How many rows the whole result holds, when the read reported one. */
    total?: number;
    /** Whether a further page exists, when the total is unknown. */
    hasMore: boolean;
    onFirstChange: (first: number) => void;
    onPageSizeChange: (pageSize: number) => void;
}) {
    // A last page is only addressable when the total is known: `hasMore` says
    // there is one more page, not which index it starts at.
    const pageCount = total === undefined ? undefined : Math.max(1, Math.ceil(total / pageSize));
    const lastPageFirst = pageCount === undefined ? first : (pageCount - 1) * pageSize;
    const atEnd = pageCount === undefined ? !hasMore : first + pageSize >= total!;
    return (
        <div
            className="blong-table-paginator"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.5rem',
                justifyContent: 'center',
                userSelect: 'none',
                flexShrink: 0,
            }}
        >
            <Button
                icon="pi pi-angle-double-left"
                className="p-button-text p-button-sm"
                type="button"
                disabled={first === 0}
                onClick={() => onFirstChange(0)}
            />
            <Button
                icon="pi pi-angle-left"
                className="p-button-text p-button-sm"
                type="button"
                disabled={first === 0}
                onClick={() => onFirstChange(Math.max(0, first - pageSize))}
            />
            <span style={{padding: '0 0.5rem', fontSize: '0.875rem'}}>
                {Math.floor(first / pageSize) + 1}
                {pageCount === undefined ? '' : ` / ${pageCount}`}
            </span>
            <Button
                icon="pi pi-angle-right"
                className="p-button-text p-button-sm"
                type="button"
                disabled={atEnd}
                onClick={() => onFirstChange(first + pageSize)}
            />
            <Button
                icon="pi pi-angle-double-right"
                className="p-button-text p-button-sm"
                type="button"
                disabled={pageCount === undefined || atEnd}
                onClick={() => onFirstChange(lastPageFirst)}
            />
            <select
                value={pageSize}
                onChange={e => {
                    onPageSizeChange(Number(e.target.value));
                    onFirstChange(0);
                }}
                style={{
                    marginLeft: '0.5rem',
                    background: 'var(--surface-overlay)',
                    color: 'var(--text-color)',
                    border: '1px solid var(--surface-border)',
                    borderRadius: 'var(--border-radius)',
                    padding: '0.2rem',
                }}
            >
                {PAGE_SIZES.map(n => (
                    <option
                        key={n}
                        value={n}
                    >
                        {n}
                    </option>
                ))}
            </select>
        </div>
    );
}
