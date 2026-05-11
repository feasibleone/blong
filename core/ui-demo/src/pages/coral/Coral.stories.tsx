/**
 * Marine / Coral stories.
 *
 * Uses the `page()` helper to create stories with minimal boilerplate —
 * the same pattern as ut-model's index.stories.js.
 *
 * Parameters mirror the marine.coral model spec:
 *   - `coralId`  — record to open (for the Open page)
 *   - `layout`   — editor layout variant: 'edit' (default) | 'editSplit' | 'editThumbIndex'
 *   - `value`    — initial form value, e.g. `{coral: {coralType: 'hard'}}` to pre-select type
 */
import type {Meta} from '@storybook/react-vite';
import {page} from '../../storyHelper.js';

const meta: Meta = {
    title: 'Marine/Coral',
    parameters: {layout: 'fullscreen'},
};
export default meta;

// ── Browse ───────────────────────────────────────────────────────────────────
/** 3-panel browse with tree navigator (family hierarchy) */
export const CoralBrowse = page('marine.coral.browse');

// ── Open ─────────────────────────────────────────────────────────────────────
/** Open coral record #1 — default single-card layout */
export const CoralOpen = page('marine.coral.open', 1);
/** Open coral record #1 — two-column split layout */
export const CoralOpenSplit = page('marine.coral.open', 1, {layout: 'editSplit'});
/** Open coral record #1 — thumb-index tab layout */
export const CoralOpenThumbIndex = page('marine.coral.open', 1, {layout: 'editThumbIndex'});

// ── New ──────────────────────────────────────────────────────────────────────
/** Blank new coral form */
export const CoralNew = page('marine.coral.new');
/** New coral pre-selected as Hard Coral */
export const CoralNewHard = page('marine.coral.new', {value: {coral: {coralType: 'hard'}}});
/** New coral pre-selected as Soft Coral */
export const CoralNewSoft = page('marine.coral.new', {value: {coral: {coralType: 'soft'}}});
/** New coral form — split layout */
export const CoralNewSplit = page('marine.coral.new', {layout: 'editSplit'});
/** New coral form — thumb-index tab layout */
export const CoralNewThumbIndex = page('marine.coral.new', {layout: 'editThumbIndex'});

// ── Report ───────────────────────────────────────────────────────────────────
export const CoralReport = page('marine.coral.report');
