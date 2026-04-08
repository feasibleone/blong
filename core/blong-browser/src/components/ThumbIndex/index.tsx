/**
 * ThumbIndex — multi-panel indexer.
 * Supports horizontal tabs, vertical side tabs, and wizard-style steps.
 */
import {TabPanel, TabView} from '../../primereact/index.js';

import {useState, type ReactNode} from 'react';

export interface IThumbIndexItem {
    id: string;
    label?: string;
    icon?: string;
    items?: IThumbIndexItem[];
    /** Cards to render when this item is active */
    cards?: (string | string[])[];
}

export interface IThumbIndexProps {
    items: IThumbIndexItem[];
    orientation?: 'horizontal' | 'vertical' | 'top' | 'left' | 'bottom' | 'right';
    type?: 'tabs' | 'thumbs' | 'steps';
    /** Children rendering callback — receives the active item */
    renderContent?: (item: IThumbIndexItem) => ReactNode;
    activeId?: string;
    onChange?: (id: string) => void;
    className?: string;
}

/** Recursively flatten items to a flat list */
function flattenItems(items: IThumbIndexItem[]): IThumbIndexItem[] {
    return items.flatMap(item => (item.items ? flattenItems(item.items) : [item]));
}

export function ThumbIndex({
    items,
    orientation = 'top',
    type = 'tabs',
    renderContent,
    activeId: controlledId,
    onChange,
    className,
}: IThumbIndexProps) {
    const flatItems = flattenItems(items);
    const [internalActive, setInternalActive] = useState(flatItems[0]?.id ?? '');
    const activeId = controlledId ?? internalActive;

    const handleChange = (id: string) => {
        setInternalActive(id);
        onChange?.(id);
    };

    if (
        type === 'tabs' ||
        orientation === 'top' ||
        orientation === 'bottom' ||
        orientation === 'horizontal'
    ) {
        return (
            <TabView
                activeIndex={flatItems.findIndex(i => i.id === activeId)}
                onTabChange={e => handleChange(flatItems[e.index].id)}
                className={`blong-thumb-index blong-thumb-index--horizontal ${className ?? ''}`}
            >
                {flatItems.map(item => (
                    <TabPanel
                        key={item.id}
                        header={
                            <span className="blong-thumb-index__tab-header">
                                {item.icon && <i className={`pi ${item.icon}`} />}
                                {item.label && <span>{item.label}</span>}
                            </span>
                        }
                    >
                        {renderContent?.(item)}
                    </TabPanel>
                ))}
            </TabView>
        );
    }

    // Vertical (left sidebar) layout
    if (orientation === 'left' || orientation === 'vertical') {
        const activeItem = flatItems.find(i => i.id === activeId);
        return (
            <div className={`blong-thumb-index blong-thumb-index--vertical ${className ?? ''}`}>
                <nav className="blong-thumb-index__nav">
                    {items.map(group => (
                        <div
                            key={group.id}
                            className="blong-thumb-index__nav-group"
                        >
                            {group.icon && (
                                <button
                                    className="blong-thumb-index__nav-icon"
                                    type="button"
                                >
                                    <i className={`pi ${group.icon}`} />
                                </button>
                            )}
                            <ul className="blong-thumb-index__nav-items">
                                {(group.items ?? [group]).map(item =>
                                    renderNavItem(item, activeId, handleChange),
                                )}
                            </ul>
                        </div>
                    ))}
                </nav>
                <div className="blong-thumb-index__content">
                    {activeItem && renderContent?.(activeItem)}
                </div>
            </div>
        );
    }

    return null;
}

function renderNavItem(
    item: IThumbIndexItem,
    activeId: string,
    onSelect: (id: string) => void,
): ReactNode {
    const hasChildren = item.items && item.items.length > 0;
    return (
        <li
            key={item.id}
            className={`blong-thumb-index__nav-item ${activeId === item.id ? 'blong-thumb-index__nav-item--active' : ''}`}
        >
            <button
                type="button"
                className="blong-thumb-index__nav-btn"
                onClick={() => !hasChildren && onSelect(item.id)}
            >
                {hasChildren ? (
                    <i className="pi pi-chevron-down blong-thumb-index__nav-expand" />
                ) : null}
                {item.label}
            </button>
            {hasChildren && (
                <ul className="blong-thumb-index__nav-children">
                    {item.items!.map(child => renderNavItem(child, activeId, onSelect))}
                </ul>
            )}
        </li>
    );
}
