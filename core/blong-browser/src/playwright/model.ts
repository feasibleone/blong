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
import {BLONG_ELEMENT_TIMEOUT, type Portal} from '../playwright.js';

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
    /**
     * Master-detail (IModelSpec.details): for each detail entity the create test
     * switches to its tab (a sibling array property, e.g. `line`), adds rows in
     * the editable table, commits them and captures tab screenshots; the edit
     * test also screenshots the detail tab showing the loaded rows.
     *
     * ```ts
     * details: [
     *     {object: 'line', rows: 2, fields: {
     *         lineName: 'Widget', lineQuantity: 2,
     *     }},
     * ]
     * ```
     */
    details?: Array<{
        /** Detail entity name, e.g. 'line' — matches `IModelSpec.details[].object`. */
        object: string;
        /** Fields for one detail row (column name → value), e.g. `{lineName, lineQuantity}`. */
        fields: FieldMap;
        /** Number of rows to add in the create test (default 1). */
        rows?: number;
    }>;
    /**
     * Optional browse-search text to filter by before opening a row in the
     * generated edit test, so it targets a specific (e.g. test-created) row
     * instead of the first row of the unfiltered table.
     */
    search?: string;
    /**
     * Whether the create test should also apply `editFields` right after save
     * (in the same tab).  Defaults to `true`.  Set to `false` when the created
     * record must keep its create default so the edit test can change a
     * non-text field (e.g. a date) to a distinct value.
     */
    editInCreate?: boolean;
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
                if (cls === 'blong-number' || cls === 'blong-integer' || cls === 'blong-bigint')
                    return 'number';
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
                await page
                    .locator('.p-dropdown-item')
                    .first()
                    .waitFor({state: 'visible', timeout: BLONG_ELEMENT_TIMEOUT});
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

/** Unwrap a FieldMap value to its plain value (for dirty-change detection). */
function unwrapValue(raw: FieldMap[string]): string | number | boolean {
    return typeof raw === 'object' && raw !== null ? (raw as IFieldValue).value : raw;
}

/** Capitalize the first letter — matches the tab label `withDefaults` uses (`$object` → `$Object`). */
function capital(s: string): string {
    return s.replace(/^(\$*)([a-z])/, (_m, pre: string, c: string) => pre + c.toUpperCase());
}

/** Switch the editor to a master-detail tab (TabMenu item) by its label. */
async function switchToDetailTab(page: Page, object: string): Promise<void> {
    await page
        .locator('.p-tabmenu-nav .p-tabmenuitem')
        .filter({hasText: capital(object)})
        .first()
        .click();
}

/**
 * Add `rows` detail rows in the given detail tab's editable table and commit
 * each row edit, so the form value carries the detail arrays on save.
 */
async function fillDetailRows(
    page: Page,
    object: string,
    fields: FieldMap,
    rows = 1,
): Promise<void> {
    for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
        // The "+ Add" button on the detail TableWidget (form-value mode).
        await page.getByTestId(`${object}-addButton`).click();
        // Fill the new (row-editing) row's cell inputs. Cell editors carry
        // `id`/`data-testid` = `${object}-${rowIndex}-${field}`; they may be
        // `<input>` (text/number widgets) or `<textarea>` (text widget maps to
        // TextareaWidget), so match the `id` regardless of element type.
        for (const [field, raw] of Object.entries(fields)) {
            const cellId = `${object}-${rowIndex}-${field}`;
            const input = page.locator(`[id="${cellId}"]`).first();
            await input.fill(String(unwrapValue(raw)));
        }
        // Commit the row edit (PrimeReact row editor save icon).
        await page.locator('.p-row-editor-save').last().click();
    }
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
    const {subject, object, fields, editFields, search, details, editInCreate = true} = options;
    const browseMethod = `${subject}.${object}.browse`;

    test(`create ${subject} ${object}`, async ({portal}) => {
        await portal.menuClick(browseMethod);
        await portal.waitForTableData();

        // Click the Create action button (data-testid from ActionButton)
        const createTestId = `action-component-${subject}-${object}-new`;
        const addBtn = portal.page.getByTestId(createTestId).first();
        try {
            await addBtn.waitFor({state: 'visible', timeout: BLONG_ELEMENT_TIMEOUT});
            await addBtn.click();
        } catch {
            // Fallback: look for an add button by legacy testid
            await portal.page
                .getByTestId(`${object}-addButton`)
                .click({timeout: BLONG_ELEMENT_TIMEOUT});
        }

        await portal.waitForFormLoad();
        await expect(portal.page).toHaveScreenshot(`${subject}-${object}-new-empty.png`);

        // Fill form fields
        await fillFields(portal.page, fields);
        await expect(portal.page).toHaveScreenshot(`${subject}-${object}-new-filled.png`);

        // Master-detail: switch to each detail tab, add + fill rows, screenshot
        // the empty and filled tabs so the detail tables are visually covered.
        if (details && details.length > 0) {
            for (const detail of details) {
                await switchToDetailTab(portal.page, detail.object);
                await portal.page
                    .locator(`[data-testid="${detail.object}-addButton"]`)
                    .first()
                    .waitFor({state: 'visible', timeout: BLONG_ELEMENT_TIMEOUT});
                await expect(portal.page).toHaveScreenshot(
                    `${subject}-${object}-tab-${detail.object}-empty.png`,
                );
                await fillDetailRows(portal.page, detail.object, detail.fields, detail.rows ?? 1);
                await expect(portal.page).toHaveScreenshot(
                    `${subject}-${object}-tab-${detail.object}-filled.png`,
                );
            }
        }

        // Save
        await portal.save();
        await expect(portal.page).toHaveScreenshot(`${subject}-${object}-new-saved.png`);

        // After a successful create the editor switches to edit mode but keeps
        // the last-visited detail tab active (master-detail layout), which hides
        // the master fields. Return to the master tab (first TabMenu item) so
        // the `editFields` (master fields) are visible again.
        if (details && details.length > 0)
            await portal.page.locator('.p-tabmenu-nav .p-tabmenuitem').first().click();

        // Edit the same record in the same tab — verifies edit does not create a duplicate
        if (editInCreate && editFields && Object.keys(editFields).length > 0) {
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

            // Optionally filter the browse table to the row we want to edit so
            // the edit test targets the right record (e.g. a test-created row)
            // instead of the first row of the unfiltered table.
            if (search) {
                await portal.page.getByTestId('browse-search').fill(search);
                await portal.page.waitForTimeout(600); // debounce + refetch
                await portal.waitForTableData();
            }

            // Select the first data row (exclude the "No available options"
            // empty-state row), then open it via the Edit toolbar button.
            const dataRows = portal.page
                .locator('.p-datatable-tbody tr')
                .filter({hasNotText: 'No available options'}); // TODO this is brittle and can break if translated
            await dataRows.first().click();
            const editTestId = `action-component-${subject}-${object}-open`;
            await portal.page.getByTestId(editTestId).first().click();
            await portal.waitForFormLoad();
            // Wait for the API response to populate form inputs
            await portal.waitForFormData();
            await expect(portal.page).toHaveScreenshot(`${subject}-${object}-open.png`);

            // Master-detail: screenshot each detail tab showing the loaded rows,
            // then return to the master tab before the edit dirty cycle.
            if (details && details.length > 0) {
                for (const detail of details) {
                    await switchToDetailTab(portal.page, detail.object);
                    await portal.page
                        .locator(`[data-testid="${detail.object}-addButton"]`)
                        .first()
                        .waitFor({state: 'visible', timeout: BLONG_ELEMENT_TIMEOUT});
                    await expect(portal.page).toHaveScreenshot(
                        `${subject}-${object}-tab-${detail.object}-open.png`,
                    );
                }
                // Back to the master tab (first TabMenu item).
                await portal.page.locator('.p-tabmenu-nav .p-tabmenuitem').first().click();
            }

            // Dirty cycle: text/textarea fields get a random suffix so the
            // first save writes a distinct value even when a stateful mock
            // server already holds the editFields values; other widgets
            // (date/select/dropdown/number) keep their value because the
            // editFields themselves differ from the loaded record — a single
            // save then suffices.
            const suffix = ` ${Math.random().toString(36).slice(2, 8)}`;
            const suffixed = addSuffix(editFields, suffix);
            const suffixedChanges = Object.keys(suffixed).some(
                name => unwrapValue(suffixed[name]) !== unwrapValue(editFields[name]),
            );
            if (suffixedChanges) {
                await fillFields(portal.page, suffixed);
                await portal.save();
            }

            // Fill the actual editFields (different from suffixed → form dirty)
            await fillFields(portal.page, editFields);
            await expect(portal.page).toHaveScreenshot(`${subject}-${object}-edit-dirty.png`);

            // Save
            await portal.save();
            await expect(portal.page).toHaveScreenshot(`${subject}-${object}-edit-saved.png`);
        });
    }
}

export interface ICleanupModelOptions {
    subject: string;
    object: string;
    /**
     * Search text that isolates this suite's test-created rows in the browse
     * table (e.g. a description marker like "Playwright" or a status like
     * "suspended").  Must NOT match the seeded rows used by the browse
     * screenshots.
     */
    search: string;
    /** Remove method (semantic triple) whose browse-toolbar button deletes the selected row. */
    removeMethod: string;
}

/**
 * Generate a cleanup test that deletes test-created rows left over from
 * previous runs, via the browse page filter, so the DB does not need to be
 * dropped/recreated between runs.
 *
 * Registers a `cleanup {subject} {object}` test that runs first (tests execute
 * in declaration order), so a suite's leftover data is removed before the
 * browse/create/edit tests.  For each matching row it selects it, clicks the
 * Delete toolbar button, captures a screenshot of the confirmation dialog
 * (first delete only — the filtered table is deterministic), and confirms the
 * deletion.
 */
export function cleanupModel(test: ITestFn, expect: Expect, options: ICleanupModelOptions): void {
    const {subject, object, search, removeMethod} = options;
    const removeTestId = `action-${removeMethod.replace(/[/.]/g, '-')}`;

    test(`cleanup ${subject} ${object}`, async ({portal}) => {
        await portal.menuClick(`${subject}.${object}.browse`);
        await portal.waitForTableData();

        // Filter to the rows we want to remove.
        await portal.page.getByTestId('browse-search').fill(search);
        await portal.page.waitForTimeout(600); // debounce + refetch
        await portal.waitForTableData();

        // Delete every matching row, one at a time (the browse uses single
        // selection, and each Delete refreshes the filtered table).  The
        // `.p-datatable-tbody tr` locator also matches the "No available
        // options" empty-state row, so exclude it.
        const dataRows = portal.page
            .locator('.p-datatable-tbody tr')
            .filter({hasNotText: 'No available options'});
        let deleted = 0;
        for (;;) {
            const count = await dataRows.count();
            if (count === 0) break;
            await dataRows.first().click();
            const del = portal.page.getByTestId(removeTestId);
            if ((await del.count()) === 0) break;
            await del.first().click();
            // PrimeReact ConfirmDialog — screenshot the confirmation step, then
            // accept ("Yes") the deletion.
            await portal.page
                .locator('.p-confirm-dialog-accept')
                .waitFor({state: 'visible', timeout: BLONG_ELEMENT_TIMEOUT});
            if (deleted === 0) {
                await expect(portal.page).toHaveScreenshot(
                    `${subject}-${object}-cleanup-confirm.png`,
                );
            }
            await portal.page.locator('.p-confirm-dialog-accept').click();
            deleted++;
            // Wait for the delete to take effect and the table to refresh: the
            // visible data-row count must drop below the count before the delete.
            await portal.page.waitForFunction(
                expected => {
                    const rows = Array.from(
                        document.querySelectorAll('.p-datatable-tbody tr'),
                    ).filter(tr => !tr.textContent?.includes('No available options'));
                    return rows.length < expected;
                },
                count,
                {timeout: 10_000},
            );
        }
    });
}
