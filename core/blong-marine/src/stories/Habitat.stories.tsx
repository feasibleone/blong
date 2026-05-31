/**
 * Marine / Habitat stories.
 *
 * Reef systems, lagoons, and deep-water habitats.
 */
import type {Meta} from '@storybook/react-vite';
import {page} from '@feasibleone/blong-browser/storyHelper';

const meta: Meta = {
    title: 'Marine/Habitat',
    parameters: {layout: 'fullscreen'},
};
export default meta;

// ── Browse ───────────────────────────────────────────────────────────────────
export const Browse = page('marine.habitat.browse');

// ── Open ─────────────────────────────────────────────────────────────────────
/** Open habitat #1 (Great Barrier Reef) */
export const Open = page('marine.habitat.open', 1);
/** Split layout — details on left, coordinates on right */
export const OpenSplit = page('marine.habitat.open', 1, {layout: 'editSplit'});
/** Thumb-index tab layout */
export const OpenThumbIndex = page('marine.habitat.open', 1, {layout: 'editThumbIndex'});

// ── New ──────────────────────────────────────────────────────────────────────
export const New = page('marine.habitat.new');
export const NewSplit = page('marine.habitat.new', {layout: 'editSplit'});
export const NewThumbIndex = page('marine.habitat.new', {layout: 'editThumbIndex'});

// ── Report ───────────────────────────────────────────────────────────────────
export const Report = page('marine.habitat.report');
