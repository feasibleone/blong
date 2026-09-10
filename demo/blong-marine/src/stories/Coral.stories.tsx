/**
 * Marine / Coral stories.
 *
 * Uses the `page()` helper to create stories with minimal boilerplate.
 *
 * Parameters mirror the marine.coral model spec:
 *   - `coralId`  — record to open (for the Open page)
 *   - `layout`   — editor layout variant: 'edit' (default) | 'editSplit' | 'editThumbIndex'
 *   - `value`    — initial form value, e.g. `{coral: {coralType: 'hard'}}` to pre-select type
 */
import type {Meta, StoryObj} from '@storybook/react-vite';
import {page} from '@feasibleone/blong-browser/storyHelper';

const meta: Meta = {
    title: 'Marine/Coral',
    parameters: {layout: 'fullscreen'},
};
export default meta;

// ── Browse ───────────────────────────────────────────────────────────────────
/** 3-panel browse with tree navigator (family hierarchy) */
export const Browse = page('marine.coral.browse');

// ── Open ─────────────────────────────────────────────────────────────────────
/** Open coral record #1 — default single-card layout */
export const Open = page('marine.coral.open', 1);
/** Open coral record #1 — two-column split layout */
export const OpenSplit = page('marine.coral.open', 1, {layout: 'editSplit'});
/** Open coral record #1 — thumb-index tab layout */
export const OpenThumbIndex = page('marine.coral.open', 1, {layout: 'editThumbIndex'});

// ── New ──────────────────────────────────────────────────────────────────────
/** Blank new coral form */
export const New = page('marine.coral.new');
/** New coral pre-selected as Hard Coral */
export const NewHard = page('marine.coral.new', {value: {coral: {coralType: 'hard'}}});
/** New coral pre-selected as Soft Coral — types a name and saves to validate mode switch */
export const NewSoft: StoryObj = page('marine.coral.new', {value: {coral: {coralType: 'soft'}}});
NewSoft.play = async ({canvasElement, userEvent}) => {
    const nameInput = await new Promise<HTMLInputElement>((resolve, reject) => {
        const deadline = Date.now() + 30_000;
        const check = () => {
            const el = (canvasElement as HTMLElement).querySelector<HTMLInputElement>(
                'input[name="coral.coralName"]',
            );
            if (el) {
                resolve(el);
                return;
            }
            if (Date.now() >= deadline) {
                reject(new Error('Name input not found within 30 s'));
                return;
            }
            setTimeout(check, 200);
        };
        check();
    });
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Pink Soft Coral');
    await new Promise(resolve => setTimeout(resolve, 200));
    const saveBtn = (canvasElement as HTMLElement).querySelector<HTMLButtonElement>(
        'button[aria-label="Save"]:not([disabled])',
    );
    if (!saveBtn) throw new Error('Save button not enabled after typing name');
    await userEvent.click(saveBtn);
    await new Promise(resolve => setTimeout(resolve, 800));
};
/** New coral form — split layout */
export const NewSplit = page('marine.coral.new', {layout: 'editSplit'});
/** New coral form — thumb-index tab layout */
export const NewThumbIndex = page('marine.coral.new', {layout: 'editThumbIndex'});

// ── Report ───────────────────────────────────────────────────────────────────
export const Report = page('marine.coral.report');
