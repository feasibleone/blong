/**
 * Marine / Habitat stories.
 *
 * Reef systems, lagoons, and deep-water habitats.
 */
import type {Meta} from '@storybook/react-vite';
import {page} from '../../storyHelper.js';

const meta: Meta = {
    title: 'Marine/Habitat',
    parameters: {layout: 'fullscreen'},
};
export default meta;

// ── Browse ───────────────────────────────────────────────────────────────────
export const HabitatBrowse = page('marine.habitat.browse');

// ── Open ─────────────────────────────────────────────────────────────────────
/** Open habitat #1 (Great Barrier Reef) */
export const HabitatOpen = page('marine.habitat.open', 1);
/** Split layout — details on left, coordinates on right */
export const HabitatOpenSplit = page('marine.habitat.open', 1, {layout: 'editSplit'});
/** Thumb-index tab layout */
export const HabitatOpenThumbIndex = page('marine.habitat.open', 1, {layout: 'editThumbIndex'});

// ── New ──────────────────────────────────────────────────────────────────────
export const HabitatNew = page('marine.habitat.new');
export const HabitatNewSplit = page('marine.habitat.new', {layout: 'editSplit'});
export const HabitatNewThumbIndex = page('marine.habitat.new', {layout: 'editThumbIndex'});

// ── Report ───────────────────────────────────────────────────────────────────
export const HabitatReport = page('marine.habitat.report');
