import React, {useState, type ReactNode} from 'react';
import {Button, InputText} from '../../primereact/index.js';

export interface IPathSegment {
    key: string;
    label: string;
}

/**
 * PathBar — the commander navigation bar: navigation buttons (back/forward/up/
 * refresh) on the left, a combined breadcrumb / "jump to path" widget that
 * fills the remaining space, and an optional search box — Windows-Explorer
 * style.
 *
 * The crumb/jump widget renders the breadcrumb; clicking a crumb navigates,
 * while clicking the empty space switches it into an editable "jump to path"
 * input (Enter navigates, Esc/Blur exits back to breadcrumbs).
 */
export function PathBar({
    segments,
    onNavigate,
    onJump,
    nav,
    search,
}: {
    segments: IPathSegment[];
    onNavigate?: (index: number) => void;
    onJump?: (path: string) => void;
    /** Navigation buttons rendered at the far left (back/forward/up/refresh). */
    nav?: ReactNode;
    /** Search input rendered at the far right. */
    search?: ReactNode;
}) {
    const [editing, setEditing] = useState(false);
    const [jump, setJump] = useState('');

    const startJump = () => {
        setJump('');
        setEditing(true);
    };

    return (
        <div
            className="blong-commander-path-bar"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.2rem 0.4rem',
                borderBottom: '1px solid var(--surface-border)',
                minHeight: '2.1rem',
            }}
        >
            {nav}
            <div
                className="blong-commander-crumb-jump"
                title="Click a crumb to navigate · click empty space to jump to path"
                onClick={e => {
                    if (editing) return;
                    const target = e.target as HTMLElement;
                    // Clicks on breadcrumb buttons navigate via their own onClick.
                    if (target.closest('.p-button')) return;
                    startJump();
                }}
                style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    alignItems: 'center',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    cursor: editing ? 'text' : 'default',
                }}
            >
                {editing ? (
                    <InputText
                        autoFocus
                        value={jump}
                        onChange={e => setJump(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                onJump?.(jump.trim());
                                setJump('');
                                setEditing(false);
                            } else if (e.key === 'Escape') {
                                setJump('');
                                setEditing(false);
                            }
                        }}
                        onBlur={() => {
                            setJump('');
                            setEditing(false);
                        }}
                        placeholder="Jump to path…"
                        style={{width: '100%', fontSize: '0.8rem', padding: '0.2rem 0.4rem'}}
                    />
                ) : (
                    <>
                        {segments.map((segment, index) => (
                            <React.Fragment key={segment.key}>
                                {index > 0 && (
                                    <span style={{color: 'var(--text-color-secondary)', margin: '0 0.1rem'}}>/</span>
                                )}
                                <Button
                                    label={segment.label}
                                    className="p-button-text p-button-sm"
                                    style={{padding: '0.1rem 0.35rem'}}
                                    onClick={() => onNavigate?.(index)}
                                />
                            </React.Fragment>
                        ))}
                        {segments.length === 0 && (
                            <span style={{color: 'var(--text-color-secondary)', fontSize: '0.8rem'}}>
                                Home · click here to jump…
                            </span>
                        )}
                    </>
                )}
            </div>
            {search}
        </div>
    );
}
