/**
 * Page — wrapper component for portal tab content.
 *
 * Provides a consistent page header (title, breadcrumb, toolbar)
 * and a scrollable content area.
 */
import {BreadCrumb, Toolbar} from '../../primereact/index.js';

import React from 'react';
import type {IToolbarButton} from '../../index.js';
import {ActionButton} from '../ActionButton/ActionButton.js';

export interface IBreadcrumbItem {
    label: string;
    /** Action name to navigate on click */
    action?: string;
}

export interface IPageProps {
    title?: string;
    breadcrumbs?: IBreadcrumbItem[];
    /** Toolbar buttons (left) */
    toolbar?: IToolbarButton[];
    /** Toolbar buttons (right) */
    toolbarRight?: IToolbarButton[];
    /** Form id to wire submit buttons */
    formId?: string;
    className?: string;
    children?: React.ReactNode;
}

export function Page({
    title,
    breadcrumbs = [],
    toolbar = [],
    toolbarRight = [],
    formId,
    className = '',
    children,
}: IPageProps) {
    const home = {icon: 'pi pi-home'};
    const crumbModel = breadcrumbs.map(c => ({label: c.label}));

    const hasToolbar = toolbar.length > 0 || toolbarRight.length > 0;

    return (
        <div className={`blong-page ${className}`}>
            <div className="blong-page-header">
                {title && <h2 className="blong-page-title">{title}</h2>}
                {breadcrumbs.length > 0 && (
                    <BreadCrumb
                        model={crumbModel}
                        home={home}
                        className="blong-page-breadcrumb"
                    />
                )}
                {hasToolbar && (
                    <Toolbar
                        start={
                            toolbar.length > 0 ? (
                                <div className="blong-toolbar-left">
                                    {toolbar.map((btn, i) => (
                                        <ActionButton
                                            key={i}
                                            {...btn}
                                            formId={formId}
                                        />
                                    ))}
                                </div>
                            ) : undefined
                        }
                        end={
                            toolbarRight.length > 0 ? (
                                <div className="blong-toolbar-right">
                                    {toolbarRight.map((btn, i) => (
                                        <ActionButton
                                            key={i}
                                            {...btn}
                                            formId={formId}
                                        />
                                    ))}
                                </div>
                            ) : undefined
                        }
                        className="blong-page-toolbar"
                    />
                )}
            </div>
            <div className="blong-page-body">{children}</div>
        </div>
    );
}
