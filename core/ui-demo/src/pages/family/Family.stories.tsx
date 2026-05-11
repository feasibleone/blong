/**
 * Marine / Family stories.
 *
 * Coral family taxonomy — Acroporidae, Faviidae, Gorgoniidae, etc.
 */
import type {Meta} from '@storybook/react-vite';
import {page} from '../../storyHelper.js';

const meta: Meta = {
    title: 'Marine/Family',
    parameters: {layout: 'fullscreen'},
};
export default meta;

// ── Browse ───────────────────────────────────────────────────────────────────
export const FamilyBrowse = page('marine.family.browse');

// ── Open ─────────────────────────────────────────────────────────────────────
/** Open family #1 (Acroporidae) */
export const FamilyOpen = page('marine.family.open', 1);
/** Open family #1 — full layout with parentFamilyId field */
export const FamilyOpenFull = page('marine.family.open', 1, {layout: 'editFull'});

// ── New ──────────────────────────────────────────────────────────────────────
export const FamilyNew = page('marine.family.new');
export const FamilyNewFull = page('marine.family.new', {layout: 'editFull'});

// ── Report ───────────────────────────────────────────────────────────────────
export const FamilyReport = page('marine.family.report');
