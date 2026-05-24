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
export const Browse = page('marine.species.browse');

// ── Open ─────────────────────────────────────────────────────────────────────
/** Open species #1 (Clownfish) */
export const Open = page('marine.species.open', 1);
/** Split layout — taxonomy left, biology right */
export const OpenSplit = page('marine.species.open', 1, {layout: 'editSplit'});
/** Thumb-index layout */
export const OpenThumbIndex = page('marine.species.open', 1, {layout: 'editThumbIndex'});

// ── New ──────────────────────────────────────────────────────────────────────
export const New = page('marine.species.new');
/** New species pre-selected in family #1 (Acroporidae) */
export const NewFamily1 = page('marine.species.new', {'species.familyId': 1});
export const NewSplit = page('marine.species.new', {layout: 'editSplit'});
export const NewThumbIndex = page('marine.species.new', {layout: 'editThumbIndex'});

// ── Report ───────────────────────────────────────────────────────────────────
export const Report = page('marine.species.report');
