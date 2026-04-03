/**
 * Card — container component grouping related fields with a label.
 * Design-mode-aware from day one.
 */
import React, {useState, type ReactNode} from 'react';
import {DesignHandle} from '../../design/DesignHandle.js';
import {SelectionIndicator} from '../../design/SelectionIndicator.js';
import {useDesignable} from '../../design/useDesignable.js';
import {useDesignMode} from '../../design/useDesignMode.js';

export interface ICardProps {
    name: string;
    label?: string;
    children?: ReactNode;
    readOnly?: boolean;
    loading?: boolean;
    collapsible?: boolean;
    /** Additional CSS class */
    className?: string;
    /** Unique element ID for design mode */
    designId?: string;
}

export function Card({
    name,
    label,
    children,
    readOnly: _readOnly,
    loading,
    collapsible,
    className,
    designId,
}: ICardProps) {
    const [collapsed, setCollapsed] = useState(false);
    const {active: isDesignMode} = useDesignMode();
    const elementId = designId ?? `card:${name}`;
    const {isSelected, select, dragProps, designClass, style} = useDesignable(elementId, 'card');

    return (
        <div
            className={[
                'blong-card',
                collapsed ? 'blong-card--collapsed' : '',
                loading ? 'blong-card--loading' : '',
                designClass,
                className ?? '',
            ]
                .filter(Boolean)
                .join(' ')}
            style={style}
            onClick={isDesignMode ? select : undefined}
            {...(isDesignMode ? (dragProps as React.HTMLAttributes<HTMLDivElement>) : {})}
        >
            {/* Card header */}
            {(label || collapsible || isDesignMode) && (
                <div className="blong-card__header">
                    {isDesignMode && (
                        <DesignHandle
                            label={label}
                            onSelect={select}
                        />
                    )}
                    {label && (
                        <h3
                            className="blong-card__label"
                            onClick={collapsible ? () => setCollapsed(c => !c) : undefined}
                        >
                            {collapsible && (
                                <i
                                    className={`pi ${collapsed ? 'pi-chevron-right' : 'pi-chevron-down'} blong-card__collapse-icon`}
                                />
                            )}
                            {label}
                        </h3>
                    )}
                </div>
            )}

            {/* Card body */}
            {!collapsed && (
                <div className="blong-card__body">
                    {loading ? (
                        <div className="blong-card__skeleton">
                            {[1, 2, 3].map(i => (
                                <div
                                    key={i}
                                    className="blong-skeleton-row"
                                />
                            ))}
                        </div>
                    ) : (
                        children
                    )}
                </div>
            )}

            {/* Selection indicator in design mode */}
            {isSelected && (
                <SelectionIndicator
                    id={elementId}
                    label={label ?? name}
                />
            )}
        </div>
    );
}
