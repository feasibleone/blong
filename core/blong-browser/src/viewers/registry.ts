/**
 * Viewer registry — maps a resource type to a specialized React viewer.
 *
 * The commander explorer resolves the viewer for a leaf node from the source
 * descriptor's `viewer` field (or the model system — see `resolveViewer`).
 * Specialized viewers (DB tables, pod logs, manifests, messages, documents,
 * key-values, files, images, secrets) register here so the generic UI stays
 * decoupled from the concrete backends.
 */
import type React from 'react';

/** Props shared by all commander viewers. */
export interface ICommanderViewerProps {
    /** The leaf node row data (list fields as returned by the parent). */
    node: Record<string, unknown>;
    /** Optional fetcher that loads the full node content (e.g. `node.get`). */
    fetch?: (params?: Record<string, unknown>) => Promise<unknown>;
    /** Fetched content (set by the parent, or loaded via `fetch`). */
    data?: unknown;
    /** Optional content-type hint (e.g. for files/images). */
    contentType?: string;
    className?: string;
}

export type CommanderViewer = React.ComponentType<ICommanderViewerProps>;

const viewers = new Map<string, CommanderViewer>();

/** Register a viewer for a resource type. Later registrations win. */
export function registerViewer(type: string, component: CommanderViewer): void {
    viewers.set(type, component);
}

/** Resolve the viewer component for a resource type. */
export function getViewer(type?: string): CommanderViewer | undefined {
    return type ? viewers.get(type) : undefined;
}

/** Whether a viewer is registered for the given type. */
export function hasViewer(type?: string): boolean {
    return !!type && viewers.has(type);
}

/** List all registered viewer type keys (for diagnostics / tests). */
export function listViewers(): string[] {
    return [...viewers.keys()];
}
