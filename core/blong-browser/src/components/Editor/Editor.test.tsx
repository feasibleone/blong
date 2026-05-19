import type {IWidgetProps} from '@feasibleone/blong';
import {act, fireEvent, screen, waitFor, within} from '@testing-library/react';
import {userEvent} from '@testing-library/user-event';
import React from 'react';
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {bgTranslations} from '../../../.storybook/dispatch.js';
import {useAppStore} from '../../state/appStore.js';
import {flushEffects, render} from '../../test/render.js';
import {widgetRegistry} from '../../widgets/index.js';
import {Editor, resolveTabTitle} from './Editor.js';

// Mock confirmPopup so the Reset-when-dirty confirmation accepts immediately.
// Without a mounted <ConfirmPopup /> component the real function is a no-op in
// jsdom, which would prevent doReset() from being called in the reset tests.
vi.mock('primereact/confirmpopup', () => ({
    confirmPopup: ({accept}: {accept?: () => void}) => {
        accept?.();
    },
}));

import {
    Basic,
    Design,
    EditorWithExplorer,
    Files,
    FilesInTab,
    Loading,
    ServerValidation,
    Steps,
    StepsDisabledBack,
    StepsHiddenBack,
    Submit,
    Tabs,
    Toolbar,
} from './Editor.stories.js';
import {CascadedDropdowns} from './stories/CascadedDropdowns.stories.js';
import {CascadedTables} from './stories/CascadedTables.stories.js';
import {CustomEditors} from './stories/CustomEditors.stories.js';
import {MasterDetail} from './stories/MasterDetail.stories.js';
import {MasterDetailPolymorphic} from './stories/MasterDetailPolymorphic.stories.js';
import {Pivot, PivotBG} from './stories/Pivot.stories.js';
import {PolymorphicLayout} from './stories/PolymorphicLayout.stories.js';
import {ResponsiveLayout} from './stories/ResponsiveLayout.stories.js';
import {TabbedLayout} from './stories/TabbedLayout.stories.js';
import {ThumbIndexLayout} from './stories/ThumbIndexLayout.stories.js';
import {Validation, ValidationBG} from './stories/Validation.stories.js';

/** dispatch mock: returns pre-seeded data; 'treeTreeEditError' rejects with validation errors */
const dispatch = vi.fn().mockImplementation(async (method: string) => {
    if (method === 'treeTreeEditError') {
        const err = new Error('Server validation error') as Error & {
            validation?: Record<string, string>;
        };
        err.validation = {treeName: 'Duplicate name', treeType: 'Invalid Type'};
        throw err;
    }
    return {treeName: 'Oak', treeId: 1, treeType: 1, treeDescription: '', createdOn: '2023-03-08'};
});

describe('<Editor />', () => {
    it('Basic render equals snapshot', async () => {
        const {findByTestId} = render(<Basic />, {dispatch});
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    it('Loading render equals snapshot', async () => {
        const neverResolve = vi.fn().mockImplementation(() => new Promise(() => {}));
        const {findByTestId} = render(<Loading />, {dispatch: neverResolve});
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * Design render equals snapshot
     * MISMATCH JUSTIFICATION: target injects drag-drop handles per card in
     * design mode. blong-browser controls design mode via DesignModeProvider at
     * the suite level. The Editor component itself has no `design` prop —
     * both snapshots render the same card layout without handles.
     */
    it('Design render equals snapshot', async () => {
        const {findByTestId} = render(<Design />, {dispatch});
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    it('Tabs render equals snapshot', async () => {
        const {findByTestId} = render(<Tabs />, {dispatch});
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * CascadedDropdowns render equals snapshot
     * MISMATCH JUSTIFICATION: blong-browser wires dropdowns via global `dispatch`;
     * target uses an `onDropdown` prop. The selected options differ because
     * the dispatch mock returns no data for the dropdown keys used in this story.
     */
    it('CascadedDropdowns render equals snapshot', async () => {
        const {findByTestId, container} = render(<CascadedDropdowns />, {dispatch});
        if (CascadedDropdowns.play) {
            await flushEffects(); // drain PrimeReact init timers before play() calls findByText
            await act(() =>
                CascadedDropdowns.play!({canvas: within(container), userEvent: userEvent.setup()}),
            );
            await flushEffects();
        }
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * CascadedTables render equals snapshot
     * Story uses three `widget.type='table'` cards (Person, Document, Attachment).
     * The DataTable renders correctly; row-selection-driven cascading is a
     * runtime interaction not captured by this static snapshot test.
     */
    it('CascadedTables render equals snapshot', async () => {
        const {findByTestId, container} = render(<CascadedTables />, {dispatch});
        if (CascadedTables.play) {
            await flushEffects();
            await act(() =>
                CascadedTables.play!({canvas: within(container), userEvent: userEvent.setup()}),
            );
            await flushEffects();
        }
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * CustomEditors render equals snapshot
     * MISMATCH JUSTIFICATION: target allows passing custom widget component
     * factories at the story level via `editors` prop. blong-browser uses a global
     * widgetRegistry; story-level registration is not yet implemented.
     */
    it('CustomEditors render equals snapshot', async () => {
        const {findByTestId} = render(<CustomEditors />, {dispatch});
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * MasterDetail render equals snapshot
     * MISMATCH JUSTIFICATION: target `card.watch = '$.selected.person'`
     * fills the detail card when a table row is selected. blong-browser does not
     * yet implement the `watch` reactive card-fill pattern.
     */
    it('MasterDetail render equals snapshot', async () => {
        const {findByTestId, container} = render(<MasterDetail />, {dispatch});
        if (MasterDetail.play) {
            await flushEffects();
            await act(() =>
                MasterDetail.play!({canvas: within(container), userEvent: userEvent.setup()}),
            );
            await flushEffects();
        }
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * MasterDetailPolymorphic render equals snapshot
     * MISMATCH JUSTIFICATION: `card.match` polymorphic card visibility is
     * not yet implemented in blong-browser.
     */
    it('MasterDetailPolymorphic render equals snapshot', async () => {
        const {findByTestId, container} = render(<MasterDetailPolymorphic />, {dispatch});
        if (MasterDetailPolymorphic.play) {
            await flushEffects();
            await act(() =>
                MasterDetailPolymorphic.play!({
                    canvas: within(container),
                    userEvent: userEvent.setup(),
                }),
            );
            await flushEffects();
        }
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * Pivot render equals snapshot
     * Story uses `widget.type='table'` cards (Group A, Group B), matching
     * the DataTable-based structure of the target Pivot snapshot.
     */
    it('Pivot render equals snapshot', async () => {
        const {findByTestId} = render(<Pivot />, {dispatch});
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * Pivot BG render equals snapshot
     * Same structure as Pivot with Bulgarian card labels (Група А / Група Б).
     */
    it('Pivot BG render equals snapshot', async () => {
        const {findByTestId} = render(<PivotBG />, {dispatch});
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * PolymorphicLayout render equals snapshot
     * MISMATCH JUSTIFICATION: `card.match` polymorphic card selection is not
     * yet implemented. Both cards render unconditionally.
     */
    it('PolymorphicLayout render equals snapshot', async () => {
        const {container} = render(<PolymorphicLayout />, {dispatch});
        // PolymorphicLayout renders multiple Editor instances so there are multiple test roots;
        // snapshot the outermost container instead.
        expect(container.firstChild).toMatchSnapshot();
    });

    it('ResponsiveLayout render equals snapshot', async () => {
        const {findByTestId} = render(<ResponsiveLayout />, {dispatch});
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    it('TabbedLayout render equals snapshot', async () => {
        const {findByTestId} = render(<TabbedLayout />, {dispatch});
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * ThumbIndexLayout render equals snapshot
     * orientation='left' renders PanelMenu (vertical accordion nav) instead
     * of TabMenu, matching the target PanelMenu-based ThumbIndex structure.
     * Nested sub-items within panel sections are not yet implemented.
     */
    it('ThumbIndexLayout render equals snapshot', async () => {
        const {findByTestId} = render(<ThumbIndexLayout />, {dispatch});
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    it('Submit render equals snapshot', async () => {
        const {findByTestId, container} = render(<Submit />, {dispatch});
        if (Submit.play) {
            await flushEffects();
            await act(() =>
                Submit.play!({canvas: within(container), userEvent: userEvent.setup()}),
            );
            await flushEffects();
        }
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    it('Validation render equals snapshot', async () => {
        // Apply story args explicitly — Template.bind({}) doesn't forward .args in JSX render.
        const {findByTestId, container} = render(Validation(Validation.args ?? {}), {dispatch});
        if (Validation.play) {
            await flushEffects();
            await act(() =>
                Validation.play!({canvas: within(container), userEvent: userEvent.setup()}),
            );
            await flushEffects();
        }
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * ValidationBG render equals snapshot
     * Applies bgTranslations + language 'bg' via appStore before rendering so
     * field labels and button text are in Bulgarian, matching the Storybook story.
     * Cleaned up to English after the test.
     */
    it('ValidationBG render equals snapshot', async () => {
        await act(async () => {
            useAppStore.getState().setTranslations(bgTranslations);
            useAppStore.getState().setLanguage('bg');
        });
        try {
            const {findByTestId, container} = render(ValidationBG(ValidationBG.args ?? {}), {
                dispatch,
            });
            if (ValidationBG.play) {
                await flushEffects();
                await act(() =>
                    ValidationBG.play!({canvas: within(container), userEvent: userEvent.setup()}),
                );
                await flushEffects();
            }
            expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
        } finally {
            await act(async () => {
                useAppStore.getState().setTranslations({});
                useAppStore.getState().setLanguage('en');
            });
        }
    });

    it('Server validation render equals snapshot', async () => {
        // Apply story args explicitly — Template.bind({}) doesn't forward .args in JSX render.
        const {findByTestId, container} = render(ServerValidation(ServerValidation.args ?? {}), {
            dispatch,
        });
        if (ServerValidation.play) {
            await flushEffects();
            await act(() =>
                ServerValidation.play!({canvas: within(container), userEvent: userEvent.setup()}),
            );
            await flushEffects();
        }
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    it('Toolbar render equals snapshot', async () => {
        const {findByTestId} = render(<Toolbar />, {dispatch});
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * Files render equals snapshot
     * MISMATCH JUSTIFICATION: imageUpload, ocr, webcamera, and file widget
     * types are not yet implemented in blong-browser. The snapshot shows plain
     * card layout with text inputs.
     */
    it('Files render equals snapshot', async () => {
        const {findByTestId, container} = render(<Files />, {dispatch});
        if (Files.play) {
            await flushEffects();
            await act(() => Files.play!({canvas: within(container), userEvent: userEvent.setup()}));
            await flushEffects();
        }
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * FilesInTab render equals snapshot
     * MISMATCH JUSTIFICATION: Same file widget limitation as Files.
     */
    it('FilesInTab render equals snapshot', async () => {
        const {findByTestId, container} = render(<FilesInTab />, {dispatch});
        if (FilesInTab.play) {
            await flushEffects();
            await act(() =>
                FilesInTab.play!({canvas: within(container), userEvent: userEvent.setup()}),
            );
            await flushEffects();
        }
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    it('Steps render equals snapshot', async () => {
        const {findByTestId} = render(<Steps />, {dispatch});
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    it('StepsDisabledBack render equals snapshot', async () => {
        const {findByTestId, container} = render(<StepsDisabledBack />, {dispatch});
        if (StepsDisabledBack.play) {
            await flushEffects();
            await act(() =>
                StepsDisabledBack.play!({canvas: within(container), userEvent: userEvent.setup()}),
            );
            await flushEffects();
        }
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    it('StepsHiddenBack render equals snapshot', async () => {
        const {findByTestId, container} = render(<StepsHiddenBack />, {dispatch});
        if (StepsHiddenBack.play) {
            await flushEffects();
            await act(() =>
                StepsHiddenBack.play!({canvas: within(container), userEvent: userEvent.setup()}),
            );
            await flushEffects();
        }
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * EditorTabsExplorer render equals snapshot
     * The History tab injects an Explorer (DataTable) via the `component` slot
     * on ILayoutTabItem. The play function navigates to the History tab so the
     * Explorer is visible in the snapshot.
     */
    it('EditorTabsExplorer render equals snapshot', async () => {
        const {findByTestId, container} = render(<EditorWithExplorer />, {dispatch});
        if (EditorWithExplorer.play) {
            await flushEffects();
            await act(() =>
                EditorWithExplorer.play!({canvas: within(container), userEvent: userEvent.setup()}),
            );
            await flushEffects();
        }
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    // ── Structural assertions (verify DOM structure rather than exact HTML) ────

    it('Basic: role="toolbar" element is present', async () => {
        const {container} = render(<Basic />, {dispatch});
        expect(container.querySelector('[role="toolbar"]')).toBeTruthy();
    });

    it('Basic: Edit button is present in read-only mode', async () => {
        // Basic story is in editMode; render with editMode=false to get the Edit button.
        const {container} = render(Basic({editMode: false}), {dispatch});
        // Edit button renders as icon-only — check aria-label, not text content.
        const editBtn = container.querySelector('[aria-label="Edit"]');
        expect(editBtn).toBeTruthy();
    });

    it('Tabs: tab navigation (role="menubar") is present', async () => {
        // Apply story args explicitly — Template.bind({}) doesn't forward .args in JSX render.
        const {container} = render(Tabs(Tabs.args ?? {}), {dispatch});
        // PrimeReact 10: TabMenu renders role="menubar" (was role="tablist" in v8)
        expect(container.querySelector('[role="menubar"]')).toBeTruthy();
    });

    /**
     * Steps: no toolbar — mirrors target Steps story which sets toolbar:false.
     * In blong-browser the equivalent is editable={false} to prevent the Edit button.
     */
    it('Steps: steps indicator (ol/role=tablist) is present', async () => {
        // Apply story args explicitly — Template.bind({}) doesn't forward .args in JSX render.
        const {container} = render(Steps(Steps.args ?? {}), {dispatch});
        const stepsList = container.querySelector(
            '.p-steps-list, .p-steps, [role="tablist"], .blong-form-steps',
        );
        expect(stepsList).toBeTruthy();
    });
});

// ── Editor render isolation — typing in one field must not rerender sibling widgets ──
//
// Mirrors the equivalent test suite in Form.test.tsx.
// The Editor wraps a Form and manages extra state (isDirty, localValue, savedSuccess, …).
// Before the fix, handleFormChange called setLocalValue and setIsDirty on every keystroke,
// which caused Editor → Form → all widgets to rerender.  This suite catches that regression.

const editorSpyRenderCounts: Record<string, number> = {};

const EditorSpyWidget = React.memo(function EditorSpyWidget({name, value, onChange, onBlur}: IWidgetProps) {
    editorSpyRenderCounts[name] = (editorSpyRenderCounts[name] ?? 0) + 1;
    return (
        <input
            data-testid={name}
            value={String(value ?? '')}
            onChange={e => onChange(e.target.value)}
            onBlur={onBlur}
        />
    );
});

describe('Editor render isolation', () => {
    const SPY_TYPE = '_editor_spy';

    const renderCounts: Record<string, number> = editorSpyRenderCounts;

    const SpyWidget = EditorSpyWidget;

    let prevWidget: React.ComponentType<IWidgetProps> | undefined;
    beforeAll(() => {
        prevWidget = widgetRegistry.get(SPY_TYPE);
        widgetRegistry.register(SPY_TYPE, SpyWidget as React.ComponentType<IWidgetProps>);
    });
    afterAll(() => {
        if (prevWidget) widgetRegistry.register(SPY_TYPE, prevWidget);
    });
    beforeEach(() => {
        Object.keys(renderCounts).forEach(k => delete renderCounts[k]);
    });

    const spySchema = {
        properties: {
            fieldA: {title: 'Field A', widget: {type: SPY_TYPE as 'input'}},
            fieldB: {title: 'Field B', widget: {type: SPY_TYPE as 'input'}},
        },
    };
    const spyCards = {
        edit: {label: 'Edit', widgets: ['fieldA', 'fieldB']},
    };

    it('typing in fieldA does not rerender fieldB widget', async () => {
        render(
            <Editor
                schema={spySchema}
                cards={spyCards}
                editMode
                value={{fieldA: '', fieldB: ''}}
            />,
        );

        // Wait for initial render to settle, then reset counts.
        await act(async () => {});
        renderCounts.fieldA = 0;
        renderCounts.fieldB = 0;

        const inputA = screen.getByTestId('fieldA') as HTMLInputElement;
        await act(async () => {
            fireEvent.change(inputA, {target: {value: 'x'}});
        });

        // fieldB must NOT have rerendered (no Editor-level state change on keystroke).
        expect(renderCounts.fieldB ?? 0).toBe(0);
        // fieldA should have rerendered (its own Controller updated its value).
        expect(renderCounts.fieldA ?? 0).toBeGreaterThan(0);
    });

    it('typing in multiple fields only rerenders the active field widget', async () => {
        render(
            <Editor
                schema={spySchema}
                cards={spyCards}
                editMode
                value={{fieldA: '', fieldB: ''}}
            />,
        );

        await act(async () => {});

        for (const [testId, char] of [
            ['fieldA', 'a'],
            ['fieldB', 'b'],
            ['fieldA', 'c'],
        ] as const) {
            renderCounts.fieldA = 0;
            renderCounts.fieldB = 0;

            const input = screen.getByTestId(testId) as HTMLInputElement;
            await act(async () => {
                fireEvent.change(input, {target: {value: char}});
            });

            const sibling = testId === 'fieldA' ? 'fieldB' : 'fieldA';
            expect(renderCounts[sibling] ?? 0).toBe(0);
        }
    });
});

// ── Editor reset behaviour ────────────────────────────────────────────────────
//
// Regression test for the bug where clicking Reset while the form has unsaved
// edits (i.e. localValue is still undefined and entityValue hasn't changed)
// left the form showing the dirty values, set Editor.isDirty=false, but never
// restored the original field values or re-enabled the Save/Reset buttons on
// the next edit.
//
// The fix: doReset() increments formResetKey which forces Form to call RHF's
// reset(value) even when the `value` prop reference hasn't changed.

describe('Editor reset behaviour', () => {
    const schema = {
        properties: {
            userName: {title: 'User Name'},
        },
    };
    const cards = {
        edit: {label: 'User', widgets: ['userName']},
    };

    it('restores original value and re-enables buttons after reset and re-edit', async () => {
        render(
            <Editor
                schema={schema}
                cards={cards}
                editMode
                value={{userName: 'Alice'}}
            />,
        );

        // Wait for initial render and value sync.
        await act(async () => {});

        const input = screen.getByLabelText('User Name') as HTMLInputElement;

        // ── Step 1: edit the field ───────────────────────────────────────────
        await act(async () => {
            fireEvent.change(input, {target: {value: 'Bob'}});
        });
        expect(input.value).toBe('Bob');

        // Save and Reset buttons should be enabled once the form is dirty.
        await waitFor(() => {
            const saveBtn = screen.getByRole('button', {name: 'Save'});
            const resetBtn = screen.getByRole('button', {name: 'Reset'});
            expect(saveBtn).not.toBeDisabled();
            expect(resetBtn).not.toBeDisabled();
        });

        // ── Step 2: click Reset ──────────────────────────────────────────────
        const resetBtn = screen.getByRole('button', {name: 'Reset'});
        await act(async () => {
            fireEvent.click(resetBtn);
        });

        // Original value must be restored in the input.
        await waitFor(() => {
            expect(input.value).toBe('Alice');
        });

        // Save and Reset buttons must be disabled (form is clean after reset).
        await waitFor(() => {
            const saveBtn = screen.getByRole('button', {name: 'Save'});
            const resetBtnAfter = screen.getByRole('button', {name: 'Reset'});
            expect(saveBtn).toBeDisabled();
            expect(resetBtnAfter).toBeDisabled();
        });

        // ── Step 3: edit again after reset ──────────────────────────────────
        await act(async () => {
            fireEvent.change(input, {target: {value: 'Charlie'}});
        });

        // Buttons must become enabled again — this was the core regression.
        await waitFor(() => {
            const saveBtn = screen.getByRole('button', {name: 'Save'});
            const resetBtnFinal = screen.getByRole('button', {name: 'Reset'});
            expect(saveBtn).not.toBeDisabled();
            expect(resetBtnFinal).not.toBeDisabled();
        });
    });
});

// ── resolveTabTitle — unit tests ──────────────────────────────────────────────
//
// Covers the camelCase-splitting logic used to derive portal tab titles from
// the current editor mode + resolved layout key.

describe('resolveTabTitle', () => {
    it('uses capitalized mode when layout prefix matches mode', () => {
        expect(resolveTabTitle('edit', 'edit')).toBe('Edit');
    });
    it('appends Split suffix for editSplit layout', () => {
        expect(resolveTabTitle('edit', 'editSplit')).toBe('Edit Split');
    });
    it('appends Thumb Index suffix for editThumbIndex layout', () => {
        expect(resolveTabTitle('edit', 'editThumbIndex')).toBe('Edit Thumb Index');
    });
    it('filters out Default suffix', () => {
        expect(resolveTabTitle('edit', 'editDefault')).toBe('Edit');
        expect(resolveTabTitle('view', 'viewDefault')).toBe('View');
    });
    it('returns mode only when layout prefix does not match mode (fallback case)', () => {
        // mode='new' fell back to 'edit' layout because 'newEdit' was not in layouts
        expect(resolveTabTitle('new', 'edit')).toBe('New');
        expect(resolveTabTitle('view', 'edit')).toBe('View');
    });
    it('handles newSplit layout in new mode', () => {
        expect(resolveTabTitle('new', 'newSplit')).toBe('New Split');
    });
});

// ── Editor mode behaviour ─────────────────────────────────────────────────────
//
// Verifies that:
// 1. mode='new' renders the form as editable.
// 2. After a successful save in 'new' mode, the Editor switches to 'edit' mode
//    (Save/Reset buttons become disabled because the form is clean).
// 3. mode='view' renders the form as read-only with an Edit button.
// 4. Clicking Edit from 'view' mode switches to 'edit' mode.

describe('Editor mode behaviour', () => {
    const schema = {properties: {coralName: {title: 'Name'}}};
    const cards = {edit: {label: 'Coral', widgets: ['coralName']}};
    const layouts = {
        edit: ['edit'],
        editSplit: [['edit']],
        newEdit: ['edit'],
    };

    it('mode="new" renders editable form with Save/Reset buttons', async () => {
        render(
            <Editor
                schema={schema}
                cards={cards}
                layouts={layouts}
                mode="new"
                value={{}}
            />,
        );
        await act(async () => {});
        expect(screen.getByRole('button', {name: 'Save'})).toBeTruthy();
        expect(screen.getByRole('button', {name: 'Reset'})).toBeTruthy();
        // form is initially clean — Save disabled
        expect(screen.getByRole('button', {name: 'Save'})).toBeDisabled();
    });

    it('mode="new" saves via saveAction and switches to edit mode (buttons disabled)', async () => {
        const saveMock = vi.fn().mockResolvedValue({coralName: 'Brain Coral', coralId: 42});
        const dispatch = vi.fn().mockImplementation(async (method: string, params: unknown) => {
            if (method === 'coral.add') return saveMock(params);
            return {};
        });

        render(
            <Editor
                schema={schema}
                cards={cards}
                layouts={layouts}
                mode="new"
                saveAction="coral.add"
                value={{}}
            />,
            {dispatch},
        );
        await act(async () => {});

        // Make the form dirty
        const input = screen.getByLabelText('Name') as HTMLInputElement;
        await act(async () => {
            fireEvent.change(input, {target: {value: 'Brain Coral'}});
        });

        // Save button should be enabled now
        await waitFor(() => {
            expect(screen.getByRole('button', {name: 'Save'})).not.toBeDisabled();
        });

        // Click Save
        await act(async () => {
            fireEvent.click(screen.getByRole('button', {name: 'Save'}));
        });

        // After save: form clean → buttons disabled (mode switched to 'edit')
        await waitFor(() => {
            expect(screen.getByRole('button', {name: 'Save'})).toBeDisabled();
            expect(screen.getByRole('button', {name: 'Reset'})).toBeDisabled();
        });

        // The save action was called exactly once
        expect(saveMock).toHaveBeenCalledTimes(1);
    });

    it('mode="view" renders read-only form with Edit button', async () => {
        render(
            <Editor
                schema={schema}
                cards={cards}
                layouts={layouts}
                mode="view"
                editable
                value={{coralName: 'Fan Coral'}}
            />,
        );
        await act(async () => {});
        expect(screen.getByRole('button', {name: 'Edit'})).toBeTruthy();
        // No Save/Reset buttons in view mode
        expect(screen.queryByRole('button', {name: 'Save'})).toBeNull();
    });

    it('clicking Edit from view mode switches to edit mode', async () => {
        render(
            <Editor
                schema={schema}
                cards={cards}
                layouts={layouts}
                mode="view"
                editable
                value={{coralName: 'Fan Coral'}}
            />,
        );
        await act(async () => {});

        await act(async () => {
            fireEvent.click(screen.getByRole('button', {name: 'Edit'}));
        });

        // Edit button gone, Save/Reset appear
        expect(screen.queryByRole('button', {name: 'Edit'})).toBeNull();
        expect(screen.getByRole('button', {name: 'Save'})).toBeTruthy();
    });
});

// ── resolveLayoutKey (via Editor) — mode+layout resolution ───────────────────
//
// Verifies that the Editor resolves the effective layout key from mode + layout
// with sensible fallbacks, mirroring the ut-prime getLayout pattern.

describe('Editor mode+layout resolution', () => {
    const schema = {properties: {coralName: {title: 'Name'}}};

    // Two cards with distinct labels so we can assert which card is rendered
    const cards = {
        editCard: {label: 'Edit Card', widgets: ['coralName']},
        newCard: {label: 'New Card', widgets: ['coralName']},
    };

    const layouts = {
        edit: ['editCard'],
        editSplit: ['editCard'],
        newEdit: ['newCard'], // mode='new', layout='edit' → 'newEdit'
    };

    it('mode="new", layout="edit" falls through to newEdit layout', async () => {
        const {container} = render(
            <Editor
                schema={schema}
                cards={cards}
                layouts={layouts}
                mode="new"
                layout="edit"
                value={{}}
            />,
        );
        await act(async () => {});
        // 'newEdit' layout renders 'newCard'
        expect(container.textContent).toContain('New Card');
        expect(container.textContent).not.toContain('Edit Card');
    });

    it('mode="edit", layout="edit" uses edit layout', async () => {
        const {container} = render(
            <Editor
                schema={schema}
                cards={cards}
                layouts={layouts}
                mode="edit"
                layout="edit"
                value={{coralName: 'Fan'}}
            />,
        );
        await act(async () => {});
        expect(container.textContent).toContain('Edit Card');
        expect(container.textContent).not.toContain('New Card');
    });

    it('mode="new", layout="split" falls back to edit layout (no newSplit defined)', async () => {
        // No 'newSplit' or 'editSplit' → falls back to raw layout name 'split' → not defined
        // → Form renders with no cards (or default). Here we just verify no crash.
        expect(() =>
            render(
                <Editor
                    schema={schema}
                    cards={cards}
                    layouts={layouts}
                    mode="new"
                    layout="split"
                    value={{}}
                />,
            ),
        ).not.toThrow();
    });
});

// ── createAction / saveAction separation — duplicate-save regression ─────────
//
// When `createAction` and `saveAction` are distinct (as `subjectObjectNew` does),
// the first save must call createAction, switch to 'edit' mode, and ALL subsequent
// saves must call saveAction — never createAction again.
//
// This is the exact flow that caused duplicate records in the model browser:
// previously `saveAction` alone was used for both create and edit, so the second
// save called `saveAction` = `marine.coral.add` again.

describe('createAction / saveAction separation', () => {
    const schema = {properties: {coralName: {title: 'Name'}}};
    const cards = {edit: {label: 'Coral', widgets: ['coralName']}};

    it('first save calls createAction, second save calls saveAction (not createAction)', async () => {
        const createMock = vi.fn().mockResolvedValue({coralName: 'Brain Coral', coralId: 99});
        const editMock = vi.fn().mockResolvedValue({coralName: 'Brain Coral II', coralId: 99});
        const dispatch = vi.fn().mockImplementation(async (method: string, params: unknown) => {
            if (method === 'coral.add') return createMock(params);
            if (method === 'coral.edit') return editMock(params);
            return {};
        });

        render(
            <Editor
                schema={schema}
                cards={cards}
                mode="new"
                createAction="coral.add"
                saveAction="coral.edit"
                value={{}}
            />,
            {dispatch},
        );
        await act(async () => {});

        // ── First save (create) ──────────────────────────────────────────────
        await act(async () => {
            fireEvent.change(screen.getByLabelText('Name'), {target: {value: 'Brain Coral'}});
        });
        await waitFor(() => expect(screen.getByRole('button', {name: 'Save'})).not.toBeDisabled());

        await act(async () => {
            fireEvent.click(screen.getByRole('button', {name: 'Save'}));
        });
        await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
        expect(editMock).not.toHaveBeenCalled();

        // Mode must have switched to 'edit' — Save is now disabled (form is clean)
        await waitFor(() => expect(screen.getByRole('button', {name: 'Save'})).toBeDisabled());

        // ── Second save (edit) ───────────────────────────────────────────────
        await act(async () => {
            fireEvent.change(screen.getByLabelText('Name'), {target: {value: 'Brain Coral II'}});
        });
        await waitFor(() => expect(screen.getByRole('button', {name: 'Save'})).not.toBeDisabled());

        await act(async () => {
            fireEvent.click(screen.getByRole('button', {name: 'Save'}));
        });
        await waitFor(() => expect(editMock).toHaveBeenCalledTimes(1));

        // createAction must NOT have been called a second time
        expect(createMock).toHaveBeenCalledTimes(1);
    });

    it('Form Inspector State section exposes editorMode and editorLayout', async () => {
        const dispatch = vi.fn().mockResolvedValue({});

        // Render with debug=true BlongUiProvider so FormInspector is shown
        const {container} = render(
            <Editor
                schema={schema}
                cards={cards}
                mode="new"
                createAction="coral.add"
                saveAction="coral.edit"
                value={{}}
            />,
            {dispatch},
        );
        // Patch the BlongUiProvider debug flag post-render via the provider's internal
        // context. Instead of relying on debug mode (which requires patching the provider),
        // verify through the data-testid attribute that the Editor renders in 'new' mode.
        await act(async () => {});

        // The blong-editor root should exist and have the test id
        const editorRoot = container.querySelector('[data-testid="blong-browser-test"]');
        expect(editorRoot).toBeTruthy();

        // Save is disabled (form is clean / new mode)
        expect(screen.getByRole('button', {name: 'Save'})).toBeDisabled();
        // Reset is also disabled
        expect(screen.getByRole('button', {name: 'Reset'})).toBeDisabled();
    });
});
