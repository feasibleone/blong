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
export const Browse = page('marine.family.browse');

// ── Open ─────────────────────────────────────────────────────────────────────
/** Open family #1 (Acroporidae) */
export const Open = page('marine.family.open', 1);
/** Open family #1 — full layout with parentFamilyId field */
export const OpenFull = page('marine.family.open', 1, {layout: 'editFull'});

// ── New ──────────────────────────────────────────────────────────────────────
export const New = page('marine.family.new');
export const NewFull = page('marine.family.new', {layout: 'editFull'});

// ── Report ───────────────────────────────────────────────────────────────────
export const Report = page('marine.family.report');
