/**
 * Marine / Species stories.
 *
 * Marine species — clownfish, blue tang, nurse shark, etc.
 * The browse page shows a tree navigator (family hierarchy) like the Coral stories.
 */
import type {Meta} from '@storybook/react-vite';
import {page} from '../../storyHelper.js';

const meta: Meta = {
    title: 'Marine/Species',
    parameters: {layout: 'fullscreen'},
};
export default meta;

// ── Browse ───────────────────────────────────────────────────────────────────
/** 3-panel browse with tree navigator (family hierarchy) */
export const SpeciesBrowse = page('marine.species.browse');

// ── Open ─────────────────────────────────────────────────────────────────────
/** Open species #1 (Clownfish) */
export const SpeciesOpen = page('marine.species.open', 1);
/** Split layout — taxonomy left, biology right */
export const SpeciesOpenSplit = page('marine.species.open', 1, {layout: 'editSplit'});
/** Thumb-index layout */
export const SpeciesOpenThumbIndex = page('marine.species.open', 1, {layout: 'editThumbIndex'});

// ── New ──────────────────────────────────────────────────────────────────────
export const SpeciesNew = page('marine.species.new');
/** New species pre-selected in family #1 (Acroporidae) */
export const SpeciesNewFamily1 = page('marine.species.new', {'species.familyId': 1});
export const SpeciesNewSplit = page('marine.species.new', {layout: 'editSplit'});
export const SpeciesNewThumbIndex = page('marine.species.new', {layout: 'editThumbIndex'});

// ── Report ───────────────────────────────────────────────────────────────────
export const SpeciesReport = page('marine.species.report');
