/**
 * Generic CRUD test helpers for blong model pages.
 *
 * These helpers generate Playwright tests for Browse, New/Create, Edit,
 * and navigation flows. They work with any model spec — the test data
 * and field mappings are passed as parameters.
 *
 * Widget types are auto-detected from the DOM using `blong-*` CSS classes,
 * so test code only needs to provide field names and values:
 *
 * Usage:
 * ```ts
 * import {test, expect} from '@feasibleone/blong-browser/playwright';
 * import {browseModel, createAndEditModel} from '@feasibleone/blong-browser/playwright/model';
 *
 * test.describe('Coral CRUD', () => {
 *     browseModel(test, expect, {subject: 'marine', object: 'coral'});
 *     createAndEditModel(test, expect, {
 *         subject: 'marine',
 *         object: 'coral',
 *         fields: {
 *             'coral.coralName': 'Test Coral',
 *             'coral.coralType': 'Soft Coral',
 *             'coral.familyId': 'Gorgoniidae',
 *             'coral.endangered': true,
 *             'coral.maxDepth': 25,
 *             'coral.discovered': '06/15/2024',
 *             'coral.description': 'A test coral',
 *         },
 *         editFields: {'coral.coralName': 'Test Coral Edited'},
 *     });
 * });
 * ```
 */
import type {Expect, Page} from '@playwright/test';
import type {Portal} from '../playwright.js';

/** Minimal test function interface — accepts any Playwright TestType that provides a `portal` fixture. */
interface ITestFn {
    (title: string, fn: (args: {portal: Portal}) => Promise<void>): void;
    describe: (title: string, fn: () => void) => void;
}

export interface IFieldValue {
    /** Explicit widget type override (normally auto-detected from the DOM). */
    widget?: 'select' | 'dropdown' | 'textarea' | 'number' | 'date' | 'checkbox' | 'text';
    /** Value to set. */
    value: string | number | boolean;
}

export type FieldMap = Record<string, string | number | boolean | IFieldValue>;

export interface IBrowseModelOptions {
    subject: string;
    object: string;
    /** Optional search text to type before taking the screenshot (filters table rows). */
    searchText?: string;
}

export interface ICreateAndEditModelOptions {
    subject: string;
    object: string;
    /** Fields to fill when creating a new record. Key is the field name attribute. */
    fields: FieldMap;
    /** Fields to change when editing (subset of fields). */
    editFields?: FieldMap;
}

/**
 * Detect the widget type for a field by inspecting `blong-*` CSS classes in the DOM.
 * Walks up from the element with the given id / data-testid to find the widget wrapper.
 */
async function detectWidgetType(page: Page, fieldId: string): Promise<string> {
    return page.evaluate(id => {
        const el = document.getElementById(id) ?? document.querySelector(`[data-testid="${id}"]`);
        if (!el) return 'text';
        let current: Element | null = el;
        while (current) {
            for (const cls of current.classList) {
                if (cls === 'blong-dropdown') return 'dropdown';
                if (cls === 'blong-boolean') return 'checkbox';
                if (cls === 'blong-date') return 'date';
                if (cls === 'blong-datetime') return 'datetime';
                if (cls === 'blong-textarea') return 'textarea';
                if (cls === 'blong-number') return 'number';
                if (cls === 'blong-select-wrapper') return 'select';
                if (cls === 'blong-input') return 'text';
            }
            current = current.parentElement;
        }
        return 'text';
    }, fieldId);
}

/** Fill form fields, auto-detecting widget types from the DOM. */
export async function fillFields(page: Page, fields: FieldMap): Promise<void> {
    for (const [name, raw] of Object.entries(fields)) {
        const spec: IFieldValue =
            typeof raw === 'object' && raw !== null ? (raw as IFieldValue) : {value: raw};
        // Widget IDs use hyphens (coral-familyId) while name attrs use dots (coral.familyId)
        const fieldId = name.replace(/\./g, '-');
        const widget = spec.widget ?? (await detectWidgetType(page, fieldId));

        switch (widget) {
            case 'textarea':
                await page.fill(`textarea[name="${name}"]`, String(spec.value));
                break;
            case 'select': {
                // PrimeReact SelectButton uses div[role="button"], not <button>
                await page
                    .locator(`.p-selectbutton [role="button"]:has-text("${String(spec.value)}")`)
                    .first()
                    .click();
                break;
            }
            case 'dropdown': {
                // DropdownWidget sets data-testid={id ?? name} on the wrapper
                const dropdown = page.locator(`[data-testid="${fieldId}"]`);
                await dropdown.click();
                await page.locator('.p-dropdown-item').first().waitFor({state: 'visible'});
                await page.locator(`.p-dropdown-item:has-text("${String(spec.value)}")`).click();
                break;
            }
            case 'number':
                await page.fill(`input[name="${name}"]`, String(spec.value));
                break;
            case 'checkbox': {
                // BooleanWidget sets inputId={id ?? name} on the checkbox input
                const cb = page.locator(`input[type="checkbox"][id="${fieldId}"]`);
                if (spec.value) {
                    await cb.check();
                } else {
                    await cb.uncheck();
                }
                break;
            }
            case 'datetime':
            case 'date': {
                // DateWidget sets inputId={id ?? name} on the Calendar input
                const input = page.locator(`input[id="${fieldId}"]`);
                await input.fill(String(spec.value));
                // Press Escape to close the date picker if it opened
                await input.press('Escape');
                break;
            }
            default:
                // text, password, etc.
                await page.fill(`input[name="${name}"]`, String(spec.value));
                break;
        }
    }
}

/**
 * Append a random suffix to text/textarea field values.
 * Used for the dirty cycle in the edit test to handle stateful mock servers.
 */
function addSuffix(fields: FieldMap, suffix: string): FieldMap {
    const result: FieldMap = {};
    for (const [name, raw] of Object.entries(fields)) {
        if (typeof raw === 'string') {
            result[name] = raw + suffix;
        } else if (typeof raw === 'number' || typeof raw === 'boolean') {
            result[name] = raw;
        } else {
            const spec = raw as IFieldValue;
            if (!spec.widget || spec.widget === 'text' || spec.widget === 'textarea') {
                result[name] = {...spec, value: String(spec.value) + suffix};
            } else {
                result[name] = raw;
            }
        }
    }
    return result;
}

/**
 * Generate a browse-page test for a model.
 * Opens the browse page via the menu and takes a screenshot.
 */
export function browseModel(test: ITestFn, expect: Expect, options: IBrowseModelOptions): void {
    const {subject, object} = options;
    const method = `${subject}.${object}.browse`;

    test(`browse ${subject} ${object}`, async ({portal}) => {
        await portal.menuClick(method);
        await portal.waitForTableData();
        if (options.searchText) {
            const search = portal.page.getByTestId('browse-search');
            await search.fill(options.searchText);
            // Wait for debounce + re-render
            await portal.page.waitForTimeout(500);
            await portal.waitForTableData();
        }
        await expect(portal.page).toHaveScreenshot(`${subject}-${object}-browse.png`);
    });
}

/**
 * Generate create + edit tests for a model.
 * Creates a new record, verifies it appears, then edits it.
 */
export function createAndEditModel(
    test: ITestFn,
    expect: Expect,
    options: ICreateAndEditModelOptions,
): void {
    const {subject, object, fields, editFields} = options;
    const browseMethod = `${subject}.${object}.browse`;

    test(`create ${subject} ${object}`, async ({portal}) => {
        await portal.menuClick(browseMethod);
        await portal.waitForTableData();

        // Click the Create action button (data-testid from ActionButton)
        const createTestId = `action-component-${subject}-${object}-new`;
        const addBtn = portal.page.getByTestId(createTestId).first();
        try {
            await addBtn.waitFor({state: 'visible', timeout: 3000});
            await addBtn.click();
        } catch {
            // Fallback: look for an add button by legacy testid
            await portal.page.getByTestId(`${object}-addButton`).click({timeout: 3000});
        }

        await portal.waitForFormLoad();
        await expect(portal.page).toHaveScreenshot(`${subject}-${object}-new-empty.png`);

        // Fill form fields
        await fillFields(portal.page, fields);
        await expect(portal.page).toHaveScreenshot(`${subject}-${object}-new-filled.png`);

        // Save
        await portal.save();
        await expect(portal.page).toHaveScreenshot(`${subject}-${object}-new-saved.png`);

        // Edit the same record in the same tab — verifies edit does not create a duplicate
        if (editFields && Object.keys(editFields).length > 0) {
            await fillFields(portal.page, editFields);
            await expect(portal.page).toHaveScreenshot(`${subject}-${object}-new-edit-dirty.png`);

            await portal.save();
            await expect(portal.page).toHaveScreenshot(`${subject}-${object}-new-edit-saved.png`);
        }
    });

    if (editFields && Object.keys(editFields).length > 0) {
        test(`edit ${subject} ${object}`, async ({portal}) => {
            await portal.menuClick(browseMethod);
            await portal.waitForTableData();

            // Select the first row, then click the Edit button in the browse toolbar
            await portal.page.locator('.p-datatable-tbody tr').first().click();
            const editTestId = `action-component-${subject}-${object}-open`;
            await portal.page.getByTestId(editTestId).first().click();
            await portal.waitForFormLoad();
            // Wait for the API response to populate form inputs
            await portal.waitForFormData();
            await expect(portal.page).toHaveScreenshot(`${subject}-${object}-open.png`);

            // Dirty cycle: append a random suffix, save, then set the actual
            // values and save again.  This handles stateful mock servers where
            // a previous test run may have already set the same editFields values.
            const suffix = ` ${Math.random().toString(36).slice(2, 8)}`;
            await fillFields(portal.page, addSuffix(editFields, suffix));
            await portal.save();

            // Fill the actual editFields (different from suffixed → form dirty)
            await fillFields(portal.page, editFields);
            await expect(portal.page).toHaveScreenshot(`${subject}-${object}-edit-dirty.png`);

            // Save
            await portal.save();
            await expect(portal.page).toHaveScreenshot(`${subject}-${object}-edit-saved.png`);
        });
    }
}
