/**
 * Card — container component grouping related fields with a label.
 * Extends PrimeReact Card; design-mode-aware.
 */
import { Card as PrimeCard } from 'primereact/card';
import React, { useState, type ReactNode } from 'react';
import { DesignHandle } from '../../design/DesignHandle.js';
import { SelectionIndicator } from '../../design/SelectionIndicator.js';
import { useDesignable } from '../../design/useDesignable.js';
import { useDesignMode } from '../../design/useDesignMode.js';

export interface ICardProps {
    /** Card title shown in the header */
    title?: string | ReactNode;
    children?: ReactNode;
    readOnly?: boolean;
    loading?: boolean;
    collapsible?: boolean;
    /** Additional CSS class */
    className?: string;
    /** Unique element ID for design-mode anchoring */
    id?: string;
}

export function Card({
    title,
    children,
    readOnly: _readOnly,
    loading,
    collapsible,
    className,
    id,
}: ICardProps) {
    const [collapsed, setCollapsed] = useState(false);
    const {active: isDesignMode} = useDesignMode();
    const elementId = id ?? 'card';
    const {isSelected, select, dragProps, designClass, style} = useDesignable(elementId, 'card');

    /** Build the title element — includes collapse toggle and design handle */
    const titleNode =
        title || collapsible || isDesignMode ? (
            <>
                {isDesignMode && (
                    <DesignHandle
                        label={typeof title === 'string' ? title : undefined}
                        onSelect={select}
                    />
                )}
                {title && (
                    <span
                        className="blong-card__label"
                        onClick={collapsible ? () => setCollapsed(c => !c) : undefined}
                        style={collapsible ? {cursor: 'pointer'} : undefined}
                    >
                        {collapsible && (
                            <i
                                className={`pi ${collapsed ? 'pi-chevron-right' : 'pi-chevron-down'} blong-card__collapse-icon`}
                            />
                        )}
                        {title}
                    </span>
                )}
            </>
        ) : undefined;

    const cardClassName =
        [
            collapsed ? 'blong-card--collapsed' : '',
            loading ? 'blong-card--loading' : '',
            designClass,
            className ?? '',
        ]
            .filter(Boolean)
            .join(' ') || undefined;

    return (
        <PrimeCard
            id={elementId}
            title={titleNode}
            className={cardClassName}
            style={style}
            onClick={isDesignMode ? select : undefined}
            {...(isDesignMode ? (dragProps as React.HTMLAttributes<HTMLDivElement>) : {})}
        >
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
            {isSelected && (
                <SelectionIndicator
                    id={elementId}
                    label={typeof title === 'string' ? title : elementId}
                />
            )}
        </PrimeCard>
    );
}
