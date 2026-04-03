/**
 * storybook.ts — Storybook-specific exports.
 *
 * Re-exports everything from index.ts plus testing utilities
 * and story helpers that should not be in the production bundle.
 */
export * from './index.js';

// Design mode components used in stories
export { ComponentPalette } from './design/ComponentPalette.js';
export { DesignHandle } from './design/DesignHandle.js';
export { DropZone } from './design/DropZone.js';
export { PropertyEditor } from './design/PropertyEditor.js';
export { SelectionIndicator } from './design/SelectionIndicator.js';

